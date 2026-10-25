import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
export default defineBackground(() => {
  // Handle the click ourselves: action.onClicked is what grants activeTab for the page.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // open() must run synchronously inside the click gesture.
    void browser.sidePanel.open({ tabId: tab.id });
    // An already-open panel re-reads the tab now that it can see it.
    void browser.runtime
      .sendMessage({ type: 'checkoutguard:granted', tabId: tab.id })
      .catch(() => {});
  });
});
