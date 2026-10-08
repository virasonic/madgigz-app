package es.aurasonic.madgigz;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // The near-black canvas behind the WebView, so the status/nav-bar strips we
    // expose by insetting the WebView match the app instead of flashing white.
    View content = findViewById(android.R.id.content);
    if (content != null) content.setBackgroundColor(0xFF0A0807);

    WebView webView = getBridge().getWebView();
    if (webView == null) return;
    webView.setBackgroundColor(0xFF0A0807);

    // Android 15+ (targetSdk 36) forces edge-to-edge: the WebView fills behind
    // the status and navigation bars, and Android's WebView (unlike iOS's
    // WKWebView) doesn't expose their heights to env(safe-area-inset-*). INSET
    // THE WEBVIEW ITSELF by the system-bar insets - a margin, not padding - so
    // its whole viewport (including position:fixed overlays like the settings
    // sheet and the feed's top bar) lays out below the status bar and above the
    // gesture bar. Padding only shifts in-flow content and leaves fixed elements
    // clipped under the status bar, which is what build 3 did. iOS uses env().
    ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      ViewGroup.LayoutParams lp = v.getLayoutParams();
      if (lp instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        // Guard the write so setLayoutParams -> relayout -> re-dispatch can't loop.
        if (mlp.leftMargin != bars.left || mlp.topMargin != bars.top
            || mlp.rightMargin != bars.right || mlp.bottomMargin != bars.bottom) {
          mlp.leftMargin = bars.left;
          mlp.topMargin = bars.top;
          mlp.rightMargin = bars.right;
          mlp.bottomMargin = bars.bottom;
          v.setLayoutParams(mlp);
        }
      } else {
        // Parent doesn't take margins - fall back to padding (build-3 behaviour).
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      }
      return WindowInsetsCompat.CONSUMED;
    });
    // Force a first dispatch in case the WebView was laid out before the listener.
    ViewCompat.requestApplyInsets(webView);

    // Swallow long-press so Android's WebView stops popping the raw-URL tooltip.
    webView.setOnLongClickListener(v -> true);
    webView.setLongClickable(false);

    // #159 - offline cold-launch fallback. The app loads from a remote
    // server.url (https://madgigz.aurasonic.es), so with no connection the
    // top-level navigation fails. Capacitor's own error fallback
    // (bridge.getErrorUrl()) points back at that SAME remote host, which is
    // exactly what's unreachable offline, so it fails again and the user sees a
    // blank screen (iOS/WKWebView serves the bundled page; Android didn't).
    // Override the main-frame error to load the BUNDLED offline shell instead -
    // it's always present on-device and reads the saved tickets from Preferences
    // to render them (#129). Sub-resource errors fall through to the default, and
    // the guard stops a loop if the offline page itself ever errors.
    final String offlineUrl = "file:///android_asset/public/index.html";
    getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null
            && request.isForMainFrame()
            && !request.getUrl().toString().startsWith("file:///android_asset/public/")) {
          view.loadUrl(offlineUrl);
          return;
        }
        super.onReceivedError(view, request, error);
      }
    });
  }
}
