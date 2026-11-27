/**
 * Canonical Thunder influencer import field definitions.
 * Maps imported columns directly to existing `influencers_thunder` schema fields
 * and additive multi-platform fields without duplicating existing columns.
 */

export type ThunderFieldKey =
  | "name"
  | "handle"
  | "instagram_profile_url"
  | "youtube_channel_name"
  | "youtube_channel_url"
  | "facebook_profile_url"
  | "other_profiles"
  | "email"
  | "phone"
  | "whatsapp"
  | "followers"
  | "youtube_subscribers"
  | "engagement_rate"
  | "avg_reel_views"
  | "avg_likes"
  | "avg_comments"
  | "niche_tags"
  | "subcategory"
  | "bio"
  | "city"
  | "state"
  | "country"
  | "languages"
  | "gender"
  | "age_group"
  | "content_styles"
  | "formats"
  | "rate_reel"
  | "rate_story"
  | "rate_carousel"
  | "rate_youtube_video"
  | "rate_collab"
  | "manager_name"
  | "manager_contact"
  | "negotiation_notes"
  | "tags"
  | "source"
  | "platform_account_id"
  | "open_to_barter"
  | "gst_registered";

export type ThunderFieldGroup =
  | "Identity & Social"
  | "Contact"
  | "Metrics"
  | "Profile & Location"
  | "Pricing"
  | "Management & Meta";

export interface ThunderFieldDef {
  key: ThunderFieldKey;
  label: string;
  dbColumn: string;
  group: ThunderFieldGroup;
  description: string;
  synonyms: string[];
  isArray?: boolean;
  isNumeric?: boolean;
  isMoney?: boolean;
}

export const THUNDER_FIELDS: ThunderFieldDef[] = [
  // Identity & Social
  {
    key: "name",
    label: "Influencer Name",
    dbColumn: "name",
    group: "Identity & Social",
    description: "Creator or channel display name",
    synonyms: [
      "name", "full name", "creator name", "influencer name", "influencer", "creator",
      "artist name", "talent name", "display name", "profile name",
    ],
  },
  {
    key: "handle",
    label: "Instagram Username",
    dbColumn: "handle",
    group: "Identity & Social",
    description: "Normalized Instagram handle (without @)",
    synonyms: [
      "instagram", "insta id", "ig handle", "ig username", "instagram username", "instagram handle",
      "insta handle", "handle", "username", "ig", "ig id", "insta", "instagram id",
    ],
  },
  {
    key: "instagram_profile_url",
    label: "Instagram Profile URL",
    dbColumn: "handle",
    group: "Identity & Social",
    description: "Instagram profile link (normalized into Instagram handle)",
    synonyms: [
      "instagram link", "ig url", "insta profile", "instagram url", "instagram profile url",
      "ig link", "insta url", "insta link", "profile link", "profile url", "ig profile",
    ],
  },
  {
    key: "youtube_channel_name",
    label: "YouTube Channel Name",
    dbColumn: "youtube_channel_name",
    group: "Identity & Social",
    description: "YouTube channel title",
    synonyms: ["youtube channel name", "yt channel name", "youtube name", "channel name", "yt name"],
  },
  {
    key: "youtube_channel_url",
    label: "YouTube Channel URL",
    dbColumn: "youtube_channel_url",
    group: "Identity & Social",
    description: "Canonical YouTube channel URL or @handle",
    synonyms: [
      "youtube channel url", "youtube url", "youtube link", "yt link", "yt url",
      "yt channel", "youtube", "youtube profile", "yt channel url",
    ],
  },
  {
    key: "facebook_profile_url",
    label: "Facebook Profile URL",
    dbColumn: "facebook_profile_url",
    group: "Identity & Social",
    description: "Facebook page or profile URL",
    synonyms: ["facebook profile url", "facebook url", "facebook link", "fb url", "fb link", "facebook", "fb profile"],
  },
  {
    key: "other_profiles",
    label: "Other Social Media Profiles",
    dbColumn: "other_profiles",
    group: "Identity & Social",
    description: "Other social links (TikTok, X, LinkedIn, Threads, etc.)",
    synonyms: [
      "other social media profiles", "other social profiles", "other profiles", "other links",
      "social links", "twitter", "x url", "linkedin", "tiktok", "threads", "snapchat",
    ],
  },
  {
    key: "platform_account_id",
    label: "Platform Account ID",
    dbColumn: "platform_account_ids",
    group: "Identity & Social",
    description: "External platform account or channel ID",
    synonyms: ["platform account id", "account id", "ig account id", "channel id", "social id", "external id"],
  },

  // Contact
  {
    key: "email",
    label: "Email Address",
    dbColumn: "email",
    group: "Contact",
    description: "Primary creator email address",
    synonyms: ["email", "email address", "mail", "mail id", "email id", "e-mail", "contact email", "creator email"],
  },
  {
    key: "phone",
    label: "Phone Number",
    dbColumn: "phone",
    group: "Contact",
    description: "Creator mobile / phone number (stored as string)",
    synonyms: [
      "phone", "phone number", "mobile", "mobile number", "contact number", "contact no",
      "phone no", "telephone", "cell", "mob", "ph no",
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp Number",
    dbColumn: "whatsapp",
    group: "Contact",
    description: "WhatsApp contact number",
    synonyms: ["whatsapp", "whatsapp number", "whatsapp no", "wa", "wa number", "wa no"],
  },

  // Metrics
  {
    key: "followers",
    label: "Follower Count",
    dbColumn: "followers",
    group: "Metrics",
    description: "Instagram / primary follower count",
    isNumeric: true,
    synonyms: [
      "followers", "follower count", "total followers", "ig followers", "instagram followers",
      "audience size", "follower", "fans", "reach",
    ],
  },
  {
    key: "youtube_subscribers",
    label: "Subscriber Count",
    dbColumn: "youtube_subscribers",
    group: "Metrics",
    description: "YouTube subscriber count",
    isNumeric: true,
    synonyms: ["subscribers", "subscriber count", "youtube subscribers", "yt subscribers", "subs", "yt subs"],
  },
  {
    key: "engagement_rate",
    label: "Engagement Rate",
    dbColumn: "engagement_rate",
    group: "Metrics",
    description: "Engagement rate percentage (0–100)",
    isNumeric: true,
    synonyms: ["er", "engagement", "engagement %", "engagement rate", "eng rate", "er %", "avg er"],
  },
  {
    key: "avg_reel_views",
    label: "Average Views",
    dbColumn: "avg_reel_views",
    group: "Metrics",
    description: "Average reel / video views",
    isNumeric: true,
    synonyms: ["average views", "avg views", "avg reel views", "reel views", "views", "mean views"],
  },
  {
    key: "avg_likes",
    label: "Average Likes",
    dbColumn: "avg_likes",
    group: "Metrics",
    description: "Average likes per post",
    isNumeric: true,
    synonyms: ["average likes", "avg likes", "likes"],
  },
  {
    key: "avg_comments",
    label: "Average Comments",
    dbColumn: "avg_comments",
    group: "Metrics",
    description: "Average comments per post",
    isNumeric: true,
    synonyms: ["average comments", "avg comments", "comments"],
  },

  // Profile & Location
  {
    key: "niche_tags",
    label: "Category",
    dbColumn: "niche_tags",
    group: "Profile & Location",
    description: "Primary creator categories / niches",
    isArray: true,
    synonyms: ["category", "niche", "industry", "genre", "categories", "niches", "niche tags", "vertical", "domain"],
  },
  {
    key: "subcategory",
    label: "Subcategory",
    dbColumn: "subcategory",
    group: "Profile & Location",
    description: "Specific sub-niche",
    synonyms: ["subcategory", "sub category", "sub-category", "sub niche", "subniche"],
  },
  {
    key: "bio",
    label: "Bio",
    dbColumn: "bio",
    group: "Profile & Location",
    description: "Profile bio or description",
    synonyms: ["bio", "biography", "description", "about", "profile bio", "summary"],
  },
  {
    key: "city",
    label: "City",
    dbColumn: "city",
    group: "Profile & Location",
    description: "Creator city",
    synonyms: ["city", "location", "city name", "town", "base city", "hometown"],
  },
  {
    key: "state",
    label: "State",
    dbColumn: "state",
    group: "Profile & Location",
    description: "Creator state or region",
    synonyms: ["state", "province", "region", "state name"],
  },
  {
    key: "country",
    label: "Country",
    dbColumn: "country",
    group: "Profile & Location",
    description: "Creator country",
    synonyms: ["country", "nation", "country code"],
  },
  {
    key: "languages",
    label: "Language",
    dbColumn: "languages",
    group: "Profile & Location",
    description: "Content languages",
    isArray: true,
    synonyms: ["language", "languages", "content language", "spoken language", "lang"],
  },
  {
    key: "gender",
    label: "Gender",
    dbColumn: "gender",
    group: "Profile & Location",
    description: "female, male, other, or mixed",
    synonyms: ["gender", "sex"],
  },
  {
    key: "age_group",
    label: "Age Group",
    dbColumn: "age_group",
    group: "Profile & Location",
    description: "Creator age bracket (e.g. 25-34)",
    synonyms: ["age group", "age", "age bracket"],
  },
  {
    key: "content_styles",
    label: "Content Styles",
    dbColumn: "content_styles",
    group: "Profile & Location",
    description: "Comedy, Review, Vlog, Aesthetic, etc.",
    isArray: true,
    synonyms: ["content style", "content styles", "style", "styles"],
  },
  {
    key: "formats",
    label: "Formats",
    dbColumn: "formats",
    group: "Profile & Location",
    description: "reel, story, carousel, collab",
    isArray: true,
    synonyms: ["formats", "format", "content format", "deliverables"],
  },

  // Pricing
  {
    key: "rate_reel",
    label: "Reel Pricing",
    dbColumn: "rate_reel",
    group: "Pricing",
    description: "Quoted rate for an Instagram Reel",
    isMoney: true,
    synonyms: ["reel pricing", "reel cost", "reel rate", "reel charges", "reel price", "ig reel rate", "reel fee"],
  },
  {
    key: "rate_story",
    label: "Story Pricing",
    dbColumn: "rate_story",
    group: "Pricing",
    description: "Quoted rate for an Instagram Story",
    isMoney: true,
    synonyms: ["story pricing", "story cost", "story rate", "story charges", "story price", "ig story rate"],
  },
  {
    key: "rate_carousel",
    label: "Post Pricing",
    dbColumn: "rate_carousel",
    group: "Pricing",
    description: "Quoted rate for a static / carousel post",
    isMoney: true,
    synonyms: [
      "post pricing", "post cost", "post rate", "post charges", "carousel pricing",
      "carousel rate", "static post rate", "feed post rate", "ig post rate",
    ],
  },
  {
    key: "rate_youtube_video",
    label: "YouTube Video Pricing",
    dbColumn: "rate_youtube_video",
    group: "Pricing",
    description: "Quoted rate for a YouTube integration/video",
    isMoney: true,
    synonyms: ["youtube video pricing", "youtube pricing", "yt video rate", "youtube rate", "yt cost", "youtube cost"],
  },
  {
    key: "rate_collab",
    label: "Collaboration Pricing",
    dbColumn: "rate_collab",
    group: "Pricing",
    description: "Quoted rate for a collaboration post / package",
    isMoney: true,
    synonyms: [
      "collaboration pricing", "collab pricing", "collab rate", "collab cost",
      "package rate", "bundle rate", "commercials", "rate", "pricing", "charges", "fee",
    ],
  },
  {
    key: "open_to_barter",
    label: "Open to Barter",
    dbColumn: "open_to_barter",
    group: "Pricing",
    description: "Yes / No",
    synonyms: ["open to barter", "barter", "barter ok"],
  },
  {
    key: "gst_registered",
    label: "GST Registered",
    dbColumn: "gst_registered",
    group: "Pricing",
    description: "Yes / No",
    synonyms: ["gst registered", "gst", "has gst"],
  },

  // Management & Meta
  {
    key: "manager_name",
    label: "Manager Name",
    dbColumn: "manager_name",
    group: "Management & Meta",
    description: "Talent manager or agency POC name",
    synonyms: ["manager name", "agency name", "talent manager", "poc name", "agent name"],
  },
  {
    key: "manager_contact",
    label: "Manager Contact",
    dbColumn: "manager_contact",
    group: "Management & Meta",
    description: "Manager phone / email / contact details",
    synonyms: ["manager contact", "manager", "agency contact", "poc contact", "manager phone", "manager email"],
  },
  {
    key: "negotiation_notes",
    label: "Internal Notes",
    dbColumn: "negotiation_notes",
    group: "Management & Meta",
    description: "Internal team or negotiation notes",
    synonyms: ["internal notes", "notes", "remarks", "negotiation notes", "comments internal", "feedback"],
  },
  {
    key: "tags",
    label: "Tags",
    dbColumn: "tags",
    group: "Management & Meta",
    description: "Comma-separated custom tags",
    isArray: true,
    synonyms: ["tags", "labels", "keywords", "tag"],
  },
  {
    key: "source",
    label: "Data Source",
    dbColumn: "source",
    group: "Management & Meta",
    description: "Import source label",
    synonyms: ["data source", "source", "origin", "import source"],
  },
];

export const THUNDER_FIELD_MAP = new Map<ThunderFieldKey, ThunderFieldDef>(
  THUNDER_FIELDS.map((f) => [f.key, f]),
);

export const EXPORT_TEMPLATE_COLUMNS: { key: ThunderFieldKey; header: string; example1: string; example2: string }[] = [
  { key: "name", header: "Influencer Name", example1: "Aarav Mehta (Example)", example2: "Priya Nair (Example)" },
  { key: "handle", header: "Instagram Username", example1: "@aarav.eats", example2: "priyanair.style" },
  { key: "instagram_profile_url", header: "Instagram Profile URL", example1: "https://www.instagram.com/aarav.eats/", example2: "https://instagram.com/priyanair.style" },
  { key: "youtube_channel_name", header: "YouTube Channel Name", example1: "Aarav Kitchen", example2: "" },
  { key: "youtube_channel_url", header: "YouTube Channel URL", example1: "https://www.youtube.com/@aaravkitchen", example2: "" },
  { key: "facebook_profile_url", header: "Facebook Profile URL", example1: "", example2: "https://www.facebook.com/priyanairstyle" },
  { key: "email", header: "Email Address", example1: "aarav.example@domain.test", example2: "priya.example@domain.test" },
  { key: "phone", header: "Phone Number", example1: "9876543210", example2: "+91 98200 11223" },
  { key: "whatsapp", header: "WhatsApp Number", example1: "9876543210", example2: "+91 98200 11223" },
  { key: "followers", header: "Follower Count", example1: "125K", example2: "1,50,000" },
  { key: "youtube_subscribers", header: "Subscriber Count", example1: "45K", example2: "" },
  { key: "engagement_rate", header: "Engagement Rate", example1: "3.4%", example2: "4.1%" },
  { key: "avg_reel_views", header: "Average Views", example1: "42K", example2: "55000" },
  { key: "avg_likes", header: "Average Likes", example1: "3.2K", example2: "4100" },
  { key: "avg_comments", header: "Average Comments", example1: "140", example2: "210" },
  { key: "niche_tags", header: "Category", example1: "Food", example2: "Fashion, Lifestyle" },
  { key: "subcategory", header: "Subcategory", example1: "Home Recipes", example2: "Streetwear" },
  { key: "bio", header: "Bio", example1: "Chef & recipe creator based in Bengaluru", example2: "Outfit styling & daily skincare" },
  { key: "city", header: "City", example1: "Bengaluru", example2: "Mumbai" },
  { key: "state", header: "State", example1: "Karnataka", example2: "Maharashtra" },
  { key: "country", header: "Country", example1: "India", example2: "India" },
  { key: "languages", header: "Language", example1: "English, Kannada", example2: "Hindi, English" },
  { key: "rate_reel", header: "Reel Pricing", example1: "₹15,000", example2: "25K" },
  { key: "rate_story", header: "Story Pricing", example1: "₹5,000", example2: "8000" },
  { key: "rate_carousel", header: "Post Pricing", example1: "12000", example2: "18000" },
  { key: "rate_youtube_video", header: "YouTube Video Pricing", example1: "35000", example2: "" },
  { key: "rate_collab", header: "Collaboration Pricing", example1: "40000", example2: "" },
  { key: "manager_name", header: "Manager Name", example1: "Rohan Verma", example2: "" },
  { key: "manager_contact", header: "Manager Contact", example1: "rohan.mgr@agency.test", example2: "" },
  { key: "negotiation_notes", header: "Internal Notes", example1: "Quick turnaround, shoots in 4K", example2: "Prefers skincare & apparel" },
  { key: "tags", header: "Tags", example1: "verified, south-india", example2: "mumbai, aesthetic" },
];
