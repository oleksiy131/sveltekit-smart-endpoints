import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Captures any fetch("/something") URL; we filter by the user-defined
 * folder later.
 */
const GENERIC_FETCH_REGEX =
    /fetch\s*\(\s*(['"`])(?<url>\/[^'"`)]+)\1/g;

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = [
        { language: "javascript", scheme: "file" },
        { language: "typescript", scheme: "file" },
        { language: "svelte", scheme: "file" }
    ];

    const provider = new EndpointLinkProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "sveltekit-endpoint-link.openEndpoint",
            (uri: vscode.Uri) => openEndpoint(uri)
        )
    );
}

/** Map  /folder/foo  →  <ws>/src/routes/folder/foo/+server.(ts|js) */
function resolveEndpointPath(
    workspace: vscode.WorkspaceFolder,
    url: string
): vscode.Uri | undefined {
    const base = path.join(
        workspace.uri.fsPath,
        "src",
        "routes",
        url          // url already starts with '/'
    );

    for (const ext of ["ts", "js"]) {
        const candidate = path.join(base, "+server." + ext);
        if (fs.existsSync(candidate)) {
            return vscode.Uri.file(candidate);
        }
    }
    return undefined;
}

async function openEndpoint(target: vscode.Uri) {
    try {
        const doc = await vscode.workspace.openTextDocument(target);
        vscode.window.showTextDocument(doc, { preview: false });
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open endpoint: ${err}`);
    }
}

class EndpointLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(
        doc: vscode.TextDocument
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        const workspace = vscode.workspace.getWorkspaceFolder(doc.uri);
        if (!workspace) return [];

        const folderSetting = vscode.workspace
            .getConfiguration("sveltekit-endpoint-link")
            .get<string>("endpointFolder", "api")
            .replace(/^\/|\/$/g, "");          // strip leading/trailing /

        if (!folderSetting) return [];

        const links: vscode.DocumentLink[] = [];
        const text = doc.getText();

        for (const m of text.matchAll(GENERIC_FETCH_REGEX)) {
            const url = m.groups?.url ?? "";
            if (!url.startsWith("/" + folderSetting + "/")) continue;

            const target = resolveEndpointPath(workspace, url);
            if (!target) continue;

            const start = m.index! + m[0].indexOf(url);
            const end = start + url.length;

            const range = new vscode.Range(
                doc.positionAt(start),
                doc.positionAt(end)
            );

            const link = new vscode.DocumentLink(range, target);
            link.tooltip = "Open endpoint";
            links.push(link);
        }
        return links;
    }
}

export function deactivate() {
    /* nothing */
}
