package com.chatapp.dev

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
