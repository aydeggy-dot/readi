import { describe, expect, it } from "vitest";
import { CV_MAX_BYTES } from "../constants.js";
import { CreateCvUploadRequest, CvParseRequest, ParsedCv } from "./cv.js";

const parsed = {
  skills: ["React", "TypeScript"],
  projects: [{ name: "Shop", description: "An online shop", technologies: ["Next.js"] }],
  experience: [
    {
      title: "Frontend intern",
      organisation: "Acme",
      start: "2024-01",
      end: null,
      current: true,
      summary: "Built UI components.",
    },
  ],
  gaps: ["No automated testing experience shown"],
};

describe("cv contracts", () => {
  it("accepts a parsed CV", () => {
    expect(ParsedCv.parse(parsed)).toEqual(parsed);
  });

  it("has no place for contact details", () => {
    const withContact = { ...parsed, email: "ada@example.com", phone: "+2348031234567" };
    expect(Object.keys(ParsedCv.parse(withContact))).toEqual([
      "skills",
      "projects",
      "experience",
      "gaps",
    ]);
  });

  it.each(["2024-13", "2024-1", "Jan 2024"])("rejects the month %s", (start) => {
    const experience = [{ ...parsed.experience[0], start }];
    expect(ParsedCv.safeParse({ ...parsed, experience }).success).toBe(false);
  });

  it("limits uploads to PDF/DOCX up to 5 MB", () => {
    expect(
      CreateCvUploadRequest.safeParse({ content_type: "application/pdf", size_bytes: CV_MAX_BYTES })
        .success,
    ).toBe(true);
    expect(
      CreateCvUploadRequest.safeParse({
        content_type: "application/pdf",
        size_bytes: CV_MAX_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      CreateCvUploadRequest.safeParse({ content_type: "application/msword", size_bytes: 10 })
        .success,
    ).toBe(false);
  });

  it("requires base64 file content in worker requests", () => {
    const request = {
      request_id: "8d3f9c2e-4b1a-4c7e-9f00-1a2b3c4d5e6f",
      content_type: "application/pdf",
      file_base64: Buffer.from("%PDF-1.7").toString("base64"),
      target_role_label: "Frontend engineer",
      level_label: "Mid-level",
      stack_label: null,
    };
    expect(CvParseRequest.safeParse(request).success).toBe(true);
    expect(CvParseRequest.safeParse({ ...request, file_base64: "not base64!" }).success).toBe(
      false,
    );
  });
});
