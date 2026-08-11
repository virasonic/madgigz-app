// The one city MadGigz is live in right now. This is the single knob for the
// "we are a *local* app" identity (#90): the fan surfaces filter to it and name
// it in the UI. #90b will make it dynamic - a launched-cities list, the user's
// current city, and city switching - at which point this constant becomes a
// lookup. Until then, everything local flows from here.
export const CURRENT_CITY = "Madrid";
