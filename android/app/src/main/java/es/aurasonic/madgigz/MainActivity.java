package es.aurasonic.madgigz;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

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
  }
}
