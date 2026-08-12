import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    // #128 - keep the login across app restarts (save half).
    //
    // WKWebView keeps its cookies in a store that isn't reliably flushed to disk
    // before iOS kills the app, so the Supabase session cookie is lost on a full
    // quit and the next launch lands on the sign-in screen. Here we copy the web
    // view's cookies into the disk-backed HTTPCookieStorage while we still can;
    // SceneDelegate restores them on the next cold launch. Wrapped in a
    // background-task assertion so the async cookie read finishes even if the
    // user swipes the app away right after backgrounding it.
    func applicationDidEnterBackground(_ application: UIApplication) {
        persistWebViewCookies(application)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Going to the app switcher fires this before didEnterBackground - the
        // point most kills happen from, so save here too.
        persistWebViewCookies(application)
    }

    private func persistWebViewCookies(_ application: UIApplication) {
        var task: UIBackgroundTaskIdentifier = .invalid
        task = application.beginBackgroundTask {
            if task != .invalid { application.endBackgroundTask(task); task = .invalid }
        }
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            for cookie in cookies {
                HTTPCookieStorage.shared.setCookie(cookie)
            }
            if task != .invalid { application.endBackgroundTask(task); task = .invalid }
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
