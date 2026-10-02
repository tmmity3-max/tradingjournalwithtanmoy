(function() {
  // Injected Script: Runs in the page context of TradingView.
  // Accesses the internal `TradingViewApi` or `TradingView` object to switch symbols 
  // without a full page reload.
  
  document.addEventListener("change_tradingview_symbol", function(event) {
    const { symbol, exchange } = event.detail;
    
    const tvApi = window.TradingViewApi || window.TradingView;

    if (tvApi) {
      try {
        let interval = 'D';
        if (tvApi.getSymbolInterval) {
           interval = tvApi.getSymbolInterval().interval;
        }

        const fullSymbol = exchange ? `${exchange}:${symbol}` : symbol;
        
        // Method 1: TradingViewApi.changeSymbol (Standard for some charts)
        if (tvApi.changeSymbol) {
             tvApi.changeSymbol(fullSymbol, interval);
        } 
        // Method 2: Widget API (ChartWidgetApi)
        else if (tvApi.chart && tvApi.chart().setSymbol) {
             tvApi.chart().setSymbol(fullSymbol);
        } 
        
      } catch (err) {
        console.error("[TM] Soft nav error:", err);
      }
    }
  });

  // Lets the content script ask "what symbol/exchange is actually loaded on this
  // chart right now?" — reading it straight from TradingView's own API instead of
  // guessing the exchange from an external ticker lookup. Fixes the Ctrl+Shift+A
  // shortcut occasionally tagging an NSE stock as BSE (or vice versa).
  document.addEventListener("et_request_current_symbol", function() {
    const tvApi = window.TradingViewApi || window.TradingView;
    let fullSymbol = null;
    try {
      if (tvApi) {
        if (tvApi.chart && typeof tvApi.chart === 'function' && tvApi.chart() && tvApi.chart().symbol) {
          fullSymbol = tvApi.chart().symbol();
        } else if (tvApi.symbolInterval && typeof tvApi.symbolInterval === 'function') {
          const si = tvApi.symbolInterval();
          if (si && si.symbol) fullSymbol = si.symbol;
        } else if (tvApi.getSymbol && typeof tvApi.getSymbol === 'function') {
          fullSymbol = tvApi.getSymbol();
        }
      }
    } catch (err) {
      console.error("[TM] Error reading current symbol:", err);
    }
    document.dispatchEvent(new CustomEvent("et_current_symbol_response", { detail: { symbol: fullSymbol } }));
  });
})();
