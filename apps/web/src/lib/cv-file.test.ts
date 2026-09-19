import { describe, expect, it } from "vitest";
import { checkCvFile, cvContentType } from "./cv-file";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("cvContentType", () => {
  it("uses the MIME type when present", () => {
    expect(cvContentType({ name: "cv", type: PDF })).toBe(PDF);
    expect(cvContentType({ name: "cv", type: DOCX })).toBe(DOCX);
  });

  it("falls back to the extension when the browser reports no specific type", () => {
    expect(cvContentType({ name: "My CV.DOCX", type: "" })).toBe(DOCX);
    expect(cvContentType({ name: "cv.pdf", type: "application/octet-stream" })).toBe(PDF);
  });

  it("rejects other types, including old .doc files", () => {
    expect(cvContentType({ name: "cv.doc", type: "application/msword" })).toBeNull();
    expect(cvContentType({ name: "cv.png", type: "image/png" })).toBeNull();
    expect(cvContentType({ name: "cv.pdf", type: "image/png" })).toBeNull();
  });
});

describe("checkCvFile", () => {
  it("accepts files up to 5 MB", () => {
    expect(checkCvFile({ name: "cv.pdf", type: PDF, size: 5 * 1024 * 1024 })).toBeNull();
  });

  it("names the problem", () => {
    expect(checkCvFile({ name: "cv.pdf", type: PDF, size: 5 * 1024 * 1024 + 1 })).toBe("tooLarge");
    expect(checkCvFile({ name: "cv.pdf", type: PDF, size: 0 })).toBe("empty");
    expect(checkCvFile({ name: "cv.txt", type: "text/plain", size: 10 })).toBe("type");
  });
});
