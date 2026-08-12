import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeViewController = CAPBridgeViewController()
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()

        restorePersistedCookies(into: bridgeViewController)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // #128 - keep the login across app restarts (restore half).
    //
    // AppDelegate stashed the web view's cookies in HTTPCookieStorage on the way
    // to the background. On this cold launch the web view starts with an empty
    // cookie store and has already fired its first request (which lands on the
    // signed-out screen), so we copy the persisted cookies back in and, once a
    // real Supabase auth cookie is actually restored, reload the web view so it
    // re-requests authenticated. Only reloads when there's an sb-* cookie to
    // restore, so a genuinely logged-out launch is untouched.
    private func restorePersistedCookies(into bridgeViewController: CAPBridgeViewController) {
        let persisted = HTTPCookieStorage.shared.cookies ?? []
        guard persisted.contains(where: { $0.name.hasPrefix("sb-") }) else { return }

        let store = WKWebsiteDataStore.default().httpCookieStore
        let group = DispatchGroup()
        for cookie in persisted {
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) {
            bridgeViewController.webView?.reload()
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
