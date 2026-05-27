package com.chatapp.dev

import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import org.json.JSONObject

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = false
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    installAndroidBackBridge()
    installImeInsetsBridge()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    installImeInsetsBridge()
    dispatchImeInsets(ViewCompat.getRootWindowInsets(window.decorView))
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK) {
      dispatchAndroidBack()
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  private fun installAndroidBackBridge() {
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        dispatchAndroidBack()
      }
    })
  }

  private fun dispatchAndroidBack() {
    val view = webView ?: return
    val payload = JSONObject()
      .put("source", "native-main-activity")
      .put("canGoBack", view.canGoBack())
      .put("timestamp", System.currentTimeMillis())
      .toString()
    view.post {
      view.evaluateJavascript(
        """
        (() => {
          try {
            window.dispatchEvent(new CustomEvent('chatapp-android-back', {
              cancelable: true,
              detail: $payload
            }));
          } catch (_) {
            window.dispatchEvent(new Event('chatapp-android-back'));
          }
        })();
        """.trimIndent(),
        null
      )
    }
  }

  private fun installImeInsetsBridge() {
    val root = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      dispatchImeInsets(insets)
      insets
    }
    ViewCompat.requestApplyInsets(root)
  }

  private fun dispatchImeInsets(insets: WindowInsetsCompat?) {
    val view = webView ?: return
    val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    val imeInsets = insets?.getInsets(WindowInsetsCompat.Type.ime())
    val imeVisible = insets?.isVisible(WindowInsetsCompat.Type.ime()) == true
    val imeBottomPhysicalPx = if (imeVisible) (imeInsets?.bottom ?: 0) else 0
    val imeBottomCssPx = (imeBottomPhysicalPx / density).roundToInt().coerceAtLeast(0)
    val payload = JSONObject()
      .put("visible", imeVisible && imeBottomCssPx > 0)
      .put("insetBottom", imeBottomCssPx)
      .put("rawInsetBottom", imeBottomCssPx)
      .put("insetBottomPhysicalPx", imeBottomPhysicalPx)
      .put("density", density.toDouble())
      .put("source", "android-window-insets")
      .put("timestamp", System.currentTimeMillis())
      .toString()
    view.post {
      view.evaluateJavascript(
        "window.__chatappAndroidImeInsets && window.__chatappAndroidImeInsets($payload);",
        null
      )
    }
  }
}
