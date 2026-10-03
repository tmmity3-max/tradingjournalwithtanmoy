const AUTH_PAGE = "https://tradingjournalwithtanmoy.vercel.app/extension-auth.html";
const AUTH_ORIGIN = new URL(AUTH_PAGE).origin;

const iframe = document.createElement("iframe");
iframe.src = AUTH_PAGE;
iframe.style.width = "1px";
iframe.style.height = "1px";
iframe.style.border = "0";
iframe.style.position = "fixed";
iframe.style.left = "-9999px";
iframe.setAttribute("aria-hidden", "true");
document.documentElement.appendChild(iframe);

let ready = false;
let queue = [];

iframe.addEventListener("load", () => {
  ready = true;
  const pending = queue;
  queue = [];
  pending.forEach((fn) => fn());
});

function sendToAuthPage(message) {
  return new Promise((resolve, reject) => {
    const run = () => {
      let timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Authentication page timed out."));
      }, 60000);

      function onMessage(event) {
        if (event.source !== iframe.contentWindow) return;
        if (event.origin !== AUTH_ORIGIN) return;
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          resolve(data);
        } catch (e) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          reject(e);
        }
      }

      window.addEventListener("message", onMessage);
      iframe.contentWindow.postMessage(message, AUTH_ORIGIN);
    };

    if (ready) run();
    else queue.push(run);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "offscreen" || message?.type !== "firebase-auth") return false;

  sendToAuthPage({
    initAuth: message.action === "signIn",
    getToken: message.action === "getToken",
    signOut: message.action === "signOut",
  })
    .then(sendResponse)
    .catch((e) => sendResponse({
      ok: false,
      code: e?.code || "AUTH_ERROR",
      error: e?.message || String(e),
    }));

  return true;
});
