import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { categorizeInfluencer } from "@/lib/import/categorizer";
import {
  normalizeEmail,
  normalizeInstagramInput,
  normalizePercentage,
  normalizePhone,
  normalizePrice,
  normalizeYouTubeUrl,
  parseAbbreviatedCount,
} from "@/lib/import/cleaner";
import { parseGoogleSheetUrl } from "@/lib/import/google-sheets";
import { mappingRecordFromSuggestions, suggestColumnMappings } from "@/lib/import/mapper";
import { buildCsvDocument, escapeCsvCell, parseCsvText, parseExcelBuffer, validateUploadedFileMeta } from "@/lib/import/parser";
import { analyzeImportDataset, buildDbPatchForExisting, type ExistingInfluencerSnapshot } from "@/lib/import/pipeline";
import { classifyFollowerTier, classifyPlatformTiers } from "@/lib/import/tiers";
import { parseBulkSocialUrls } from "@/lib/import/url-importer";

describe("File parsing engine (CSV & Excel)", () => {
  it("parses CSV with quoted commas, regional languages, BOM, empty rows and duplicate headings", () => {
    const csv =
      "\uFEFF\n" +
      "Random Report Title,,,\n" +
      "Creator Name,IG Handle,Phone,Phone,City\n" +
      '"Aarav, Chef",@aarav.eats,9876543210,9876543211,Bengaluru\n' +
      ",,,,\n" +
      "தமிழ் சமையல்,https://www.instagram.com/tamil.cook/?utm_source=ig,9811122233,,Chennai\n";

    const res = parseCsvText(csv);
    expect(res.detectedHeaderRow).toBe(1);
    expect(res.headers).toEqual(["Creator Name", "IG Handle", "Phone", "Phone (2)", "City"]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]["Creator Name"]).toBe("Aarav, Chef");
    expect(res.rows[1]["Creator Name"]).toBe("தமிழ் சமையல்");
  });

  it("supports semicolon-delimited CSV files", () => {
    const csv = "Name;Instagram;Followers\nPriya;@priya.fit;25.5K\n";
    const res = parseCsvText(csv);
    expect(res.delimiter).toBe(";");
    expect(res.rows[0].Followers).toBe("25.5K");
  });

  it("parses multi-sheet Excel (.xlsx) workbooks and allows worksheet selection", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Instagram"], ["Sheet1User", "@s1"]]), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Instagram"], ["Sheet2User", "@s2"]]), "Creators");
    const buf = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));

    expect(validateUploadedFileMeta("creators.xlsx", buf)).toBe("xlsx");
    const defaultSheet = parseExcelBuffer(buf);
    expect(defaultSheet.sheetNames).toEqual(["Summary", "Creators"]);
    expect(defaultSheet.rows[0].Name).toBe("Sheet1User");

    const creatorsSheet = parseExcelBuffer(buf, { sheetName: "Creators" });
    expect(creatorsSheet.selectedSheet).toBe("Creators");
    expect(creatorsSheet.rows[0].Name).toBe("Sheet2User");
  });

  it("rejects spoofed .xlsx magic bytes and protects CSV exports from formula injection", () => {
    const fake = new TextEncoder().encode("not a real zip");
    expect(() => validateUploadedFileMeta("evil.xlsx", fake)).toThrow(/signature/i);
    expect(escapeCsvCell("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(buildCsvDocument(["Name"], [["+SUM(A1)"]])).toContain("'+SUM(A1)");
  });
});

describe("Smart rule-based column mapping", () => {
  it("maps exact, synonym, and misspelled headers without assigning two columns to one field", () => {
    const headers = [
      "Creator Name",
      "IG Username",
      "Mail ID",
      "Contact No",
      "Total Followers",
      "Engagemnt Rte", // misspelled fuzzy header
      "Reel Cost",
      "Unknown Column XYZ",
    ];
    const rows: Record<string, string>[] = [{ "Creator Name": "Riya", "IG Username": "@riya", "Mail ID": "riya@test.com", "Contact No": "9876543210", "Total Followers": "50K", "Engagemnt Rte": "3.5%", "Reel Cost": "₹10,000", "Unknown Column XYZ": "foo" }];
    const suggestions = suggestColumnMappings(headers, rows);
    const map = mappingRecordFromSuggestions(suggestions);

    expect(map["Creator Name"]).toBe("name");
    expect(map["IG Username"]).toBe("handle");
    expect(map["Mail ID"]).toBe("email");
    expect(map["Contact No"]).toBe("phone");
    expect(map["Total Followers"]).toBe("followers");
    expect(map["Engagemnt Rte"]).toBe("engagement_rate");
    expect(map["Reel Cost"]).toBe("rate_reel");
    expect(map["Unknown Column XYZ"]).toBeNull();
  });

  it("prevents multiple columns from overwriting the same Thunder field", () => {
    const headers = ["Instagram", "IG Handle"];
    const suggestions = suggestColumnMappings(headers, [{ Instagram: "@a", "IG Handle": "@b" }]);
    const assigned = suggestions.filter((s) => s.targetField === "handle");
    expect(assigned).toHaveLength(1);
    expect(suggestions.some((s) => s.needsReview)).toBe(true);
  });
});

describe("Data cleaning, normalisation, categorisation & tiers", () => {
  it("normalizes Instagram usernames and rejects post/reel/story URLs", () => {
    expect(normalizeInstagramInput("@Creator.One").handle).toBe("creator.one");
    expect(normalizeInstagramInput("https://www.instagram.com/Creator_Two/?igsh=abc").handle).toBe("creator_two");
    expect(normalizeInstagramInput("https://www.instagram.com/reel/Cxyz123/").error).toMatch(/reel/i);
    expect(normalizeInstagramInput("https://www.instagram.com/p/Cxyz123/").error).toMatch(/post/i);
    expect(normalizeInstagramInput("https://www.instagram.com/stories/user/123/").error).toMatch(/story|stories/i);
  });

  it("validates YouTube URLs and rejects video watch links", () => {
    expect(normalizeYouTubeUrl("https://www.youtube.com/@mkbhd").canonicalUrl).toBe("https://www.youtube.com/@mkbhd");
    expect(normalizeYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").error).toBeTruthy();
  });

  it("converts Indian and international abbreviated follower counts & pricing", () => {
    expect(parseAbbreviatedCount("10K").value).toBe(10000);
    expect(parseAbbreviatedCount("25.5K").value).toBe(25500);
    expect(parseAbbreviatedCount("1.2M").value).toBe(1200000);
    expect(parseAbbreviatedCount("2L").value).toBe(200000);
    expect(parseAbbreviatedCount("1,50,000").value).toBe(150000);
    expect(parseAbbreviatedCount("").value).toBeNull();

    expect(normalizePrice("₹5,000")).toEqual({ amount: 5000, currency: "INR" });
    expect(normalizePrice("Rs. 10000")).toEqual({ amount: 10000, currency: "INR" });
    expect(normalizePrice("15K", "INR")).toEqual({ amount: 15000, currency: "INR" });
    expect(normalizePrice("15K", null)).toEqual({ amount: 15000, currency: null });
  });

  it("validates emails, phones (with +91 default), and engagement percentages", () => {
    expect(normalizeEmail("  User@GMAIL.COM ").value).toBe("User@gmail.com");
    expect(normalizeEmail("not-an-email").error).toBeTruthy();

    expect(normalizePhone("98765 43210", "IN").value).toBe("+919876543210");
    expect(normalizePhone("+1 415 555 2671", "IN").value).toBe("+14155552671");
    expect(normalizePhone("123", "IN").error).toBeTruthy();

    expect(normalizePercentage("4.5%").value).toBe(4.5);
    expect(normalizePercentage("150%").error).toBeTruthy();
  });

  it("performs rule-based categorisation without overwriting manual categories and classifies tiers safely", () => {
    const auto = categorizeInfluencer({ bio: "Home chef sharing easy Indian recipes and foodie reviews" });
    expect(auto.autoAssigned).toBe(true);
    expect(auto.categories).toContain("food");

    const preserved = categorizeInfluencer({ explicitCategories: ["travel"], bio: "chef cooking recipe" });
    expect(preserved.autoAssigned).toBe(false);
    expect(preserved.categories).toEqual(["travel"]);

    expect(classifyFollowerTier(null)).toBe("unknown");
    expect(classifyFollowerTier(500)).toBe("emerging");
    expect(classifyFollowerTier(5_000)).toBe("nano");
    expect(classifyFollowerTier(50_000)).toBe("micro");
    expect(classifyFollowerTier(500_000)).toBe("macro");
    expect(classifyFollowerTier(2_000_000)).toBe("mega");
    expect(classifyPlatformTiers({ followers: 20_000, youtubeSubscribers: 1_500_000 })).toEqual({
      instagram: "micro",
      youtube: "mega",
      overall: "mega",
    });
  });
});

describe("Duplicate detection, merging & bulk URLs", () => {
  const existingDb: ExistingInfluencerSnapshot[] = [
    {
      id: "inf-1",
      name: "Existing Chef",
      handle: "existing.chef",
      profile_url: "https://www.instagram.com/existing.chef/",
      youtube_channel_name: null,
      youtube_handle: null,
      youtube_channel_url: null,
      youtube_subscribers: null,
      facebook_profile_url: null,
      other_profiles: [],
      platform_account_ids: {},
      email: "chef@existing.com",
      phone: "+919876500001",
      whatsapp: null,
      followers: 50000,
      avg_reel_views: null,
      avg_likes: null,
      avg_comments: null,
      engagement_rate: 3.2,
      niche_tags: ["food"],
      subcategory: null,
      bio: "Existing bio",
      city: "Mumbai",
      state: null,
      country: null,
      languages: ["english"],
      gender: null,
      age_group: null,
      content_styles: [],
      formats: [],
      rate_reel: 15000,
      rate_story: null,
      rate_carousel: null,
      rate_youtube_video: null,
      rate_collab: null,
      rate_currency: "INR",
      open_to_barter: false,
      gst_registered: null,
      manager_name: null,
      manager_contact: null,
      negotiation_notes: null,
      tags: [],
      enrichment_required: false,
      platform_tiers: {},
    },
  ];

  it("detects in-file duplicates, DB matches, potential secondary matches, and merges missing fields safely", () => {
    const rows: Record<string, string>[] = [
      { Name: "New Creator", IG: "@new.creator", Email: "new@test.com", Phone: "9876543210", Followers: "12K", City: "Delhi" },
      { Name: "New Creator Dup", IG: "https://instagram.com/new.creator/", Email: "", Phone: "", Followers: "12K", City: "Delhi" },
      { Name: "Existing Chef Updated", IG: "@existing.chef", Email: "", Phone: "", Followers: "80K", City: "Pune", State: "Maharashtra", StoryRate: "5000" },
      { Name: "Same Manager Phone", IG: "@different.handle", Email: "chef@existing.com", Phone: "", Followers: "20K", City: "Mumbai" },
      { Name: "Bad Row", IG: "https://instagram.com/reel/ABC/", Email: "bad-email", Phone: "111", Followers: "abc", City: "" },
    ];
    const mapping = { Name: "name", IG: "handle", Email: "email", Phone: "phone", Followers: "followers", City: "city", State: "state", StoryRate: "rate_story" } as const;

    const analysis = analyzeImportDataset(rows, mapping, existingDb);
    expect(analysis.rows[0].classification).toBe("new");
    expect(analysis.rows[1].classification).toBe("duplicate_in_file");
    expect(analysis.rows[2].classification).toBe("existing");
    expect(analysis.rows[3].classification).toBe("potential_duplicate");
    expect(analysis.rows[4].classification).toBe("invalid");

    // Merge preserves existing followers (50000) & city (Mumbai), fills missing state & rate_story
    const mergePatch = buildDbPatchForExisting(existingDb[0], analysis.rows[2].normalized, "merge");
    expect(mergePatch.followers).toBeUndefined();
    expect(mergePatch.city).toBeUndefined();
    expect(mergePatch.email).toBeUndefined(); // never overwrite with blank
    expect(mergePatch.state).toBe("Maharashtra");
    expect(mergePatch.rate_story).toBe(5000);

    // Update overwrites non-empty incoming fields but never with blank email/phone
    const updatePatch = buildDbPatchForExisting(existingDb[0], analysis.rows[2].normalized, "update");
    expect(updatePatch.followers).toBe(80000);
    expect(updatePatch.city).toBe("Pune");
    expect(updatePatch.email).toBeUndefined();
  });

  it("handles 2,000+ row batch analysis quickly", () => {
    const bigRows = Array.from({ length: 2000 }, (_, i) => ({
      Name: `Creator ${i}`,
      IG: `@creator_${i}`,
      Followers: "10K",
    }));
    const start = Date.now();
    const res = analyzeImportDataset(bigRows, { Name: "name", IG: "handle", Followers: "followers" }, []);
    expect(res.summary.newCount).toBe(2000);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("parses bulk social URLs and enforces Google Sheets SSRF rules", () => {
    const bulk = parseBulkSocialUrls(
      "https://instagram.com/alpha/\n@alpha\nhttps://www.youtube.com/@mkbhd\nhttps://instagram.com/reel/xyz/",
    );
    expect(bulk[0].valid).toBe(true);
    expect(bulk[1].duplicateInPaste).toBe(true);
    expect(bulk[2].platform).toBe("youtube");
    expect(bulk[3].valid).toBe(false);

    expect(parseGoogleSheetUrl("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=123").csvExportUrl)
      .toBe("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=123");
    expect(() => parseGoogleSheetUrl("http://127.0.0.1:8080/spreadsheets/d/abc")).toThrow();
    expect(() => parseGoogleSheetUrl("https://evil.example.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")).toThrow();
  });
});
