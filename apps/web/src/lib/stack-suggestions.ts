import type { TargetRole } from "@readi/shared-types";

/** Common tools per role, offered as one-tap additions to the stack (product names, not copy). */
export const STACK_SUGGESTIONS: Record<TargetRole, readonly string[]> = {
  frontend: ["JavaScript", "TypeScript", "React", "Next.js", "Vue", "HTML/CSS", "Tailwind CSS"],
  backend: ["Node.js", "Python", "Java", "Go", "PHP", "Laravel", "Django", "PostgreSQL"],
  qa: ["Selenium", "Cypress", "Playwright", "Postman", "JUnit", "Appium", "Jira"],
};
