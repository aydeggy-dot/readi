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
    deletionScheduled: {
      subject: "Your Readi account will be deleted on {date}",
      body: "You asked us to delete your Readi account, so we've signed you out on every device.\n\nOn {date} we'll permanently delete your profile, CV, privacy choices and sign-in details. Records we must keep, such as payments, are kept without your name or contact details.\n\nIf you didn't ask for this, or you want to keep your account, email {support} before {date}.",
    },
  },
  sms: {
    otp: "Your Readi code is {code}. It expires in {minutes} minutes. Do not share it with anyone.",
    deletionScheduled:
      "Your Readi account will be deleted on {date}. If this wasn't you, or you want to keep it, email {support} before then.",
  },
} as const;
