package es.aurasonic.madgigz;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge().getWebView();
    if (webView == null) return;

    // #1 - Android 15+ (targetSdk 36) forces edge-to-edge: the WebView draws
    // behind the status and navigation bars, and Android's WebView (unlike iOS's
    // WKWebView) doesn't report their heights through env(safe-area-inset-*). So
    // pad the WebView by the real system-bar insets - once, at the container
    // level, so every screen's header/back button clears the status bar and the
    // bottom nav clears the gesture bar uniformly. The padded strips show the
    // WebView's own background, so paint it the near-black app canvas (#0a0807)
    // to avoid a white bar. iOS handles its own insets via env() in globals.css.
    webView.setBackgroundColor(0xFF0A0807);
    ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });

    // #2 - long-pressing a link in Android's WebView pops a native tooltip
    // showing the raw URL, which breaks the native feel. Swallow long-press;
    // the app has no long-press affordances that depend on it.
    webView.setOnLongClickListener(v -> true);
    webView.setLongClickable(false);
  }
}
