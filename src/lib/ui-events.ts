// Cross-component UI signals dispatched on `window`.
//
// Tapping the Feed tab in the bottom nav while already on /feed scrolls the feed
// back to the top (the TikTok/Instagram "tap the active tab to go to top"
// gesture). BottomNav fires this; FeedClient listens and scrolls its active
// pane's container to the top.
export const FEED_TO_TOP_EVENT = "madgigz:feed-to-top";
