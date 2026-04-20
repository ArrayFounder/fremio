import express from "express";

const router = express.Router();

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";

// Lisensi yang 100% aman untuk komersial tanpa syarat
const CC0_LICENSES = new Set(["cc0", "public domain", "pd"]);
const isCC0 = (licenseShortName = "") =>
  CC0_LICENSES.has(licenseShortName.toLowerCase().trim());

// Kata kunci dalam judul yang menandakan logo brand / aset tidak relevan untuk photobox
const TITLE_BLOCKLIST = /\b(logo|brand|trademark|corporation|corp\b|inc\b|ltd\b|llc\b|flag of|coat of arms|chemical|formula|anatomy|anatomical|diagram|chart|map of|mathematical|equation|wikipedia|wikimedia|signature|\bsig\b|theory of|model of|structural|flag|pride|gay|bengali|hindi|arabic|chinese|japanese|korean|thai|vietnamese|hebrew|persian|urdu|cyrillic|tamil|telugu|kannada|marathi|punjabi|gujarati|malay|burmese|khmer|georgian|armenian)\b/i;

// Karakter trademark dalam judul
const TRADEMARK_CHARS = /[®™]/;

// Judul mengandung karakter di luar ASCII dasar (Hebrew, Arabic, CJK, Cyrillic, dll)
const NON_ASCII = /[^\x00-\x7F]/;

// Suffix kode bahasa Wikimedia di akhir judul (mis. "Love zh", "Coeur fr", "Love-triangle vie")
const LANG_SUFFIX = /\s+(?:zh|fr|de|es|pt|ru|ar|ja|ko|vi|id|pl|nl|it|tr|th|hi|ur|fa|he|yi|sv|da|fi|no|hu|cs|ro|uk|bg|hr|sk|sl|ms|tl|la|eo|vie|por|ger|chi|jpn|kor|ara|rus|hin|pol|tur|dut|per|tha|ind|may|bur|kha)\s*$/i;


// GET /api/openverse-token/search?q=...&page=...&page_size=...
// Proxy ke Wikimedia Commons — hanya SVG CC0/Public Domain
router.get("/search", async (req, res) => {
  const { q = "", page = "1", page_size = "50" } = req.query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(page_size) || 50));
  // Ambil lebih banyak dari Wikimedia karena kita filter server-side
  const fetchLimit = Math.min(100, limit * 3);
  const offset = (pageNum - 1) * limit;

  if (!q.trim()) {
    return res.json({ result_count: 0, page_count: 0, page_size: limit, page: pageNum, results: [] });
  }

  // Exclude logo, diagram, anatomy agar hasil relevan untuk desain photobox
  const searchQuery = `${q} filetype:svg -logo -diagram -anatomy -chart`;

  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: searchQuery,
    srnamespace: "6",
    srlimit: "1",
    srinfo: "totalhits",
    generator: "search",
    gsrsearch: searchQuery,
    gsrnamespace: "6",
    gsrlimit: String(fetchLimit),
    gsroffset: String(offset),
    prop: "imageinfo",
    iiprop: "url|thumburl|extmetadata",
    iiurlwidth: "300",
    format: "json",
    origin: "*",
  });

  try {
    const upstream = await fetch(`${WIKIMEDIA_API}?${params}`, {
      headers: { "User-Agent": "Fremio/1.0 (https://fremio.id)" },
    });

    if (!upstream.ok) {
      console.error("[wikimedia] upstream error:", upstream.status);
      return res.json({ result_count: 0, page_count: 0, page_size: limit, page: pageNum, results: [] });
    }

    const data = await upstream.json();

    const totalHits = data?.query?.searchinfo?.totalhits ?? 0;
    const pages = Object.values(data?.query?.pages || {});

    const results = pages
      .filter(p => {
        const info = p.imageinfo?.[0];
        if (!info?.url) return false;
        const em = info.extmetadata || {};

        // Filter 1: Hanya CC0 / Public Domain
        const lic = em.LicenseShortName?.value || "";
        if (!isCC0(lic)) return false;

        // Filter 2: Wikimedia menandai file trademarked di field Restrictions
        const restrictions = (em.Restrictions?.value || "").toLowerCase();
        if (restrictions.includes("trademarked") || restrictions.includes("restricted")) return false;

        // Filter 3: Judul mengandung pola logo/brand/diagram
        const titleRaw = (p.title || "").replace("File:", "").replace(/\.[^.]+$/, "");
        if (TITLE_BLOCKLIST.test(titleRaw)) return false;

        // Filter 4: Ada simbol ® atau ™ di judul → logo brand
        if (TRADEMARK_CHARS.test(titleRaw)) return false;

        // Filter 5: Judul mengandung karakter non-ASCII (Hebrew, Arabic, CJK, dll)
        if (NON_ASCII.test(titleRaw)) return false;

        // Filter 6: Suffix kode bahasa Wikimedia ("Love zh", "Heart fr", dll)
        if (LANG_SUFFIX.test(titleRaw)) return false;

        return true;
      })
      .slice(0, limit)
      .map(p => {
        const info = p.imageinfo[0];
        const em = info.extmetadata || {};
        const title = (p.title || "")
          .replace("File:", "")
          .replace(/\.[^.]+$/, "")
          .replace(/_/g, " ");
        return {
          id: String(p.pageid),
          title,
          url: info.url,
          thumbnail: info.thumburl || info.url,
          creator: em.Artist?.value?.replace(/<[^>]+>/g, "") || "Wikimedia Commons",
          source: "wikimedia",
          license: "cc0",
          license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
        };
      });

    res.json({
      result_count: totalHits,
      page_count: Math.ceil(totalHits / limit),
      page_size: limit,
      page: pageNum,
      results,
    });
  } catch (err) {
    console.error("[wikimedia] search error:", err.message);
    res.status(503).json({ error: "Search failed" });
  }
});

export default router;


