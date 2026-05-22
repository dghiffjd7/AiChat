package com.chatapp.dev

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import org.json.JSONObject

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = true
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    installImeInsetsBridge()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    installImeInsetsBridge()
    dispatchImeInsets(ViewCompat.getRootWindowInsets(window.decorView))
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
