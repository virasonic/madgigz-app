import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // #128 - keep the login across app restarts.
        //
        // WKWebView holds its cookies in a store separate from the app's
        // disk-backed HTTPCookieStorage, and the newest rotated Supabase auth
        // cookie isn't always flushed to disk before iOS kills the app - so a
        // cold launch can present a stale/missing session cookie and dump the
        // user back at sign-in. On launch we copy any cookies we stashed in the
        // shared store back into the web view's store.
        //
        // This is deliberately ADDITIVE: it only ever copies cookies in, never
        // deletes one, so it can preserve a session but can't break a working
        // one. Sign-out still clears cookies through the normal web flow.
        restoreCookiesIntoWebView()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // The app is almost always killed from the background, so this is the
        // reliable moment to persist the current session cookie to disk.
        persistWebViewCookies()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        persistWebViewCookies()
    }

    // Copy the web view's current cookies into the disk-backed shared store.
    private func persistWebViewCookies() {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            for cookie in cookies {
                HTTPCookieStorage.shared.setCookie(cookie)
            }
        }
    }

    // On launch, seed the web view's store from the persisted cookies.
    private func restoreCookiesIntoWebView() {
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in HTTPCookieStorage.shared.cookies ?? [] {
            store.setCookie(cookie)
        }
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
