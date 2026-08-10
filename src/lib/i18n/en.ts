// The English catalog, and the source of truth for the message shape. Spanish
// (es.ts) is typed against this, so every key here must exist there too.
//
// Organised by surface. Keys are referenced as dot paths, e.g. t("nav.feed").
// {name} placeholders are filled at call time: t("greeting", { name }).
export const en = {
  common: {
    signIn: "Sign in",
    signUp: "Sign up",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    done: "Done",
    continue: "Continue",
    loading: "Loading...",
    retry: "Try again",
  },

  language: {
    label: "Language",
    system: "Match my device",
  },

  nav: {
    feed: "Feed",
    explore: "Explore",
    tickets: "Tickets",
    profile: "Profile",
  },

  landing: {
    tagline: "Local Gigs & Concerts",
    fanTitle: "I'm a Fan",
    fanDescription: "Discover events, buy tickets, vibe out",
    artistTitle: "I'm an Artist",
    artistDescription: "Claim your profile, sell your shows",
    artistBadge: "Artist",
    haveAccount: "Already have an account?",
  },

  signin: {
    title: "Welcome back",
    subtitle: "Sign in to keep the vibe going.",
    identifierLabel: "Email or username",
    passwordLabel: "Password",
    forgotPassword: "Forgot password?",
    submit: "Sign in",
    submitting: "Signing in...",
    orDivider: "or",
    withGoogle: "Sign in with Google",
    noAccount: "Don't have an account?",
    errorIdentifier: "Enter your email or username",
    errorPassword: "Enter your password",
    errorWrong: "Incorrect email or password",
  },

  signup: {
    fanBadge: "Fan",
    artistBadge: "Artist",
    title: "Create your account",
    subtitle: "Let's get you set up in a minute.",
    withGoogle: "Sign up with Google",
    orWithEmail: "or with email",
    usernameLabel: "Username",
    usernamePlaceholder: "hardfuse",
    usernameHint: "No spaces. Letters, numbers, dots, dashes and underscores.",
    usernameTaken: "That username is taken",
    usernameAvailable: "Username available",
    emailLabel: "Email",
    dobLabel: "Date of birth",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm password",
    submit: "Continue",
    submitting: "Creating account...",
    haveAccount: "Already have an account?",
    errorUsernameRequired: "Username is required",
    errorUsernameSpaces: "Usernames can't contain spaces",
    errorUsernameFormat: "Use 3-30 letters, numbers, dots, dashes or underscores",
    errorEmail: "Enter a valid email",
    errorPassword: "Use at least 8 characters",
    errorConfirm: "Passwords don't match",
    errorDob: "Enter your date of birth",
    errorTooYoung: "You must be at least {age} to join MadGigz",
    errorCaptcha: "Complete the verification below",
  },

  settings: {
    title: "Settings",
    editProfile: "Edit Profile",
    editProfilePhoto: "Photo",
    editProfileBioPhoto: "Bio & photo",
    sendFeedback: "Send feedback",
    sendFeedbackHint: "Bug, help or an idea",
    comingSoon: "Soon",
  },

  profile: {
    attended: "Attended",
    saved: "Saved",
    logOut: "Log Out",
    deleteAccount: "Delete my account",
  },
};
