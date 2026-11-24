// The @modal slot has nothing to show unless an /event/... path was soft-
// navigated to from inside the shell (see the (...)event page beside this).
// Next renders this fallback for the slot on a full-page load of any other
// app URL; without it, that load would 404.
export default function Default() {
  return null;
}
