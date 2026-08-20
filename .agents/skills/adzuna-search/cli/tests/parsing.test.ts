import { describe, expect, test } from "bun:test";
import {
  binaryFlag,
  bodyText,
  decodeHtmlEntities,
  metaContent,
  normalizeJob,
  stripTags,
  titleTag,
  type AdzunaJob,
} from "../src/helpers";

describe("decodeHtmlEntities", () => {
  test("decodes named entities", () => {
    expect(decodeHtmlEntities("Ben &amp; Jerry&#39;s")).toBe("Ben & Jerry's");
  });

  test("decodes decimal and hex numeric entities", () => {
    expect(decodeHtmlEntities("Caf&#233;")).toBe("Café");
    expect(decodeHtmlEntities("Caf&#xE9;")).toBe("Café");
  });

  test("decodes supplementary-plane code points with fromCodePoint", () => {
    expect(decodeHtmlEntities("Growth &#128512;")).toBe("Growth 😀");
  });
});

describe("stripTags", () => {
  test("removes tags and collapses whitespace, preserving Adzuna's inline highlights", () => {
    // Adzuna's `description` field wraps matched keywords in <strong> tags.
    expect(stripTags("<strong>Project</strong> <strong>Manager</strong>  needed")).toBe(
      "Project Manager needed",
    );
  });
});

describe("binaryFlag", () => {
  test("returns '1' when present, undefined when absent", () => {
    expect(binaryFlag(true)).toBe("1");
    expect(binaryFlag(false)).toBeUndefined();
    expect(binaryFlag(undefined)).toBeUndefined();
  });
});

describe("normalizeJob", () => {
  test("maps a full Adzuna Job into the contract's result shape", () => {
    const raw: AdzunaJob = {
      id: "129698749",
      title: "<strong>Project</strong> Manager",
      description: "Great <strong>project manager</strong> role...",
      created: "2026-08-01T12:00:00Z",
      redirect_url: "https://www.adzuna.com/details/129698749",
      location: { display_name: "Austin, TX", area: ["US", "Texas", "Austin"] },
      category: { label: "IT Jobs", tag: "it-jobs" },
      company: { display_name: "Acme Corp" },
      salary_min: 90000,
      salary_max: 120000,
      salary_is_predicted: "0",
      contract_time: "full_time",
      contract_type: "permanent",
    };

    const job = normalizeJob(raw);

    expect(job.id).toBe("129698749");
    expect(job.title).toBe("Project Manager");
    expect(job.company).toBe("Acme Corp");
    expect(job.location).toBe("Austin, TX");
    expect(job.date).toBe("2026-08-01T12:00:00Z");
    expect(job.url).toBe("https://www.adzuna.com/details/129698749");
    expect(job.description).toBe("Great project manager role...");
    expect(job.salaryMin).toBe(90000);
    expect(job.salaryMax).toBe(120000);
    expect(job.salaryIsPredicted).toBe(false);
    expect(job.category).toBe("IT Jobs");
    expect(job.contractType).toBe("permanent");
    expect(job.contractTime).toBe("full_time");
  });

  test("missing fields become null, never omitted or undefined", () => {
    const job = normalizeJob({});

    expect(job.id).toBeNull();
    expect(job.title).toBe("(untitled)");
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.date).toBeNull();
    expect(job.url).toBe("");
    expect(job.description).toBeNull();
    expect(job.salaryMin).toBeNull();
    expect(job.salaryMax).toBeNull();
    expect(job.salaryIsPredicted).toBeNull();
    expect(job.category).toBeNull();
    expect(job.contractType).toBeNull();
    expect(job.contractTime).toBeNull();
  });

  test("salary_is_predicted '1' maps to true", () => {
    const job = normalizeJob({ salary_is_predicted: "1" });
    expect(job.salaryIsPredicted).toBe(true);
  });
});

describe("metaContent / titleTag / bodyText (used by detail's generic extraction)", () => {
  const html = `<html><head><title>Project Manager - Acme Corp</title>
    <meta property="og:title" content="Project Manager at Acme" />
    <meta name="description" content="We are hiring a project manager." />
    </head><body><p>Full posting text goes here.</p></body></html>`;

  test("metaContent reads property= or name= meta tags", () => {
    expect(metaContent(html, "og:title")).toBe("Project Manager at Acme");
    expect(metaContent(html, "description")).toBe("We are hiring a project manager.");
  });

  test("titleTag reads and cleans the <title> element", () => {
    expect(titleTag(html)).toBe("Project Manager - Acme Corp");
  });

  test("bodyText strips head/script/style and returns visible text", () => {
    const text = bodyText(html);
    expect(text).toContain("Full posting text goes here.");
    expect(text).not.toContain("og:title");
  });
});
