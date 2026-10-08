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
    // top-level navigation fails and the user would see a blank WebView error
    // page. Override the main-frame error to load the BUNDLED offline shell
    // (always present on-device). Sub-resource errors fall through to the
    // default, and the guard stops a loop if the offline page itself errors.
    //
    // Crucially, unlike iOS/WKWebView, a file:// page on Android gets NO
    // Capacitor bridge - so the shell can neither read the saved tickets
    // (@capacitor/preferences) nor hide the launch splash (launchAutoHide is
    // off) by itself. onPageFinished below does BOTH natively: it injects the
    // tickets from the same SharedPreferences the Preferences plugin writes,
    // then lifts the splash. This is the Android half of offline tickets (#129).
    final String offlinePrefix = "file:///android_asset/public/";
    final String offlineUrl = offlinePrefix + "index.html";
    getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null
            && request.isForMainFrame()
            && !request.getUrl().toString().startsWith(offlinePrefix)) {
          view.loadUrl(offlineUrl);
          return;
        }
        super.onReceivedError(view, request, error);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (url == null || !url.startsWith(offlinePrefix)) return;

        // @capacitor/preferences stores under SharedPreferences group
        // "CapacitorStorage"; the key mirrors offline-tickets-native.ts. Feed
        // the stored store JSON straight into the shell (it already holds the
        // pre-rendered QR data URLs), or "null" when there's nothing saved.
        String json = MainActivity.this
            .getSharedPreferences("CapacitorStorage", android.content.Context.MODE_PRIVATE)
            .getString("mg.offline.tickets.v1", null);
        String payload = (json != null && !json.isEmpty()) ? json : "null";
        view.evaluateJavascript(
            "window.__OFFLINE_TICKETS=" + payload + ";"
                + "window.__renderOffline&&window.__renderOffline();",
            null);

        hideSplash();
      }

      // launchAutoHide is false so the online path can hand the splash off
      // explicitly from the web app; offline there's no bridge to do that, so
      // lift it here via the SplashScreen plugin instance. Reflection keeps this
      // Activity free of a compile-time dep on the plugin, and it's fully
      // guarded - a miss just leaves the splash as it was, never crashes.
      private void hideSplash() {
        try {
          com.getcapacitor.PluginHandle handle = getBridge().getPlugin("SplashScreen");
          Object plugin = (handle != null) ? handle.getInstance() : null;
          if (plugin == null) return;
          java.lang.reflect.Field field = plugin.getClass().getDeclaredField("splashScreen");
          field.setAccessible(true);
          Object splash = field.get(plugin);
          if (splash == null) return;
          Class<?> settingsCls =
              Class.forName("com.capacitorjs.plugins.splashscreen.SplashScreenSettings");
          Object settings = settingsCls.getDeclaredConstructor().newInstance();
          splash.getClass().getMethod("hide", settingsCls).invoke(splash, settings);
        } catch (Throwable ignored) {
          // Plugin shape changed or unavailable - leave the splash untouched.
        }
      }
    });
  }
}
