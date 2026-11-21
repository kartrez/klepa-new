import * as vscode from "vscode"

/** True when the URL is an http(s) web link, which is all the browser handles. */
export function isWebLink(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/** Integrated Browser is removed in Klepa; web links always open externally. */
export function shouldOpenLinkInIntegratedBrowser(_url: string): boolean {
  return false
}

/**
 * Open a web link in the Kilo Integrated Browser through the provided opener,
 * and fall back to the system browser when integration is unavailable or the
 * opener cannot take the link. A navigation error inside the browser does not
 * reject the opener, so this never opens both.
 */
export async function openBrowserLink(url: string, openIntegrated?: () => boolean): Promise<void> {
  const uri = vscode.Uri.parse(url)
  if (shouldOpenLinkInIntegratedBrowser(url) && openerAccepted(openIntegrated)) return
  await vscode.env.openExternal(uri)
}

function openerAccepted(openIntegrated?: () => boolean): boolean {
  if (!openIntegrated) return false
  try {
    return openIntegrated()
  } catch (error) {
    console.warn("[Kilo New] Integrated Browser open failed, opening externally:", error)
    return false
  }
}
