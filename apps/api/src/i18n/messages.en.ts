// API-side user-facing copy (emails, SMS). A TypeScript module rather than JSON so the SWC build
// includes it in dist/ without an asset-copy step.
export const en = {
  email: {
    verify: {
      subject: "Confirm your email for Readi",
      body: "Welcome to Readi. Confirm your email address by opening this link:\n\n{url}\n\nIf you did not sign up, you can ignore this email.",
    },
    resetPassword: {
      subject: "Reset your Readi password",
      body: "Someone asked to reset your Readi password. Open this link to choose a new one:\n\n{url}\n\nThe link expires in 1 hour. If this was not you, you can ignore this email.",
    },
  },
  sms: {
    otp: "Your Readi code is {code}. It expires in {minutes} minutes. Do not share it with anyone.",
  },
} as const;
