package com.projectarc.game;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // The game is a single full-screen canvas with no scrollable content —
    // Android's WebView can still draw its native scroll-indicator/overscroll
    // glow even when the page's own CSS is overflow:hidden, so suppress it
    // at the WebView level too.
    getBridge().getWebView().setVerticalScrollBarEnabled(false);
    getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
  }
}
