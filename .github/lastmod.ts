import { safeLoad, safeDump } from "https://deno.land/x/js_yaml_port@3.14.0/js-yaml.js";

const ignore = ['.git', '.github', '.pandoc', 'node_modules', 'templates'];

const foundationPath = './site/foundation';
const metaPath = './site/_includes/foundation.yml';
const foundationYaml = Deno.readTextFileSync(metaPath);

// deno-lint-ignore no-explicit-any
const meta: Record<string, any> = safeLoad(foundationYaml);

// Get last commit date for a file
function gitLastCommitDate(filePath: string): Date {
    const command = new Deno.Command('git', {
        args: ['--no-pager', 'log', '--format=%cI', '-1', '--', filePath],
        cwd: foundationPath,
    });

    const { code, stdout, stderr } = command.outputSync();
    const output = new TextDecoder().decode(stdout).trim();
    console.log(code, output, filePath, new TextDecoder().decode(stderr));
    console.assert(code === 0);
    return new Date(output);
}

// deno-lint-ignore no-explicit-any
function getMetaKey(keyString: string): Record<string, any> | undefined {
    const keys = keyString.split("/");
    // deno-lint-ignore no-explicit-any
    let struct: Record<string, any> | undefined = meta;
    for (const key of keys) {
        if (struct && struct[key] !== undefined) {
            struct = struct[key];
        } else {
            struct = undefined;
            break
        }
    }
    return struct;
}

async function readDir(path: string, relative: string) {
    const missing = [];
    for await (const dirEntry of Deno.readDir(path)) {
        if (dirEntry.isFile && dirEntry.name.endsWith(".md")) {
            const filePath = `${relative}${dirEntry.name}`;
            const rootName = dirEntry.name.replace(".md", "");
            if (path.includes("agreements/") && !path.endsWith(rootName)) {
                // don't include signed agreements (where file name doesn't match directory name)
                // agreements/bootstrapping/bootstrapping.md is fine
                // agreements/bootstrapping/bootstrapping-signed.md is not
                continue;
            }
            const struct = getMetaKey(filePath.replace(".md", ""));
            if (!struct) {
                // not all agreements will need to be on the website.
                // record that they are missing, but don't fail.
                console.error(`No metadata for ${filePath}`);
                if (!path.includes("agreements")) {
                    missing.push(filePath);
                }
                continue;
            }

            struct.date = gitLastCommitDate(filePath);
            struct.layout = 'layouts/bylaws.vto';
        } else if (dirEntry.isDirectory && !ignore.includes(dirEntry.name)) {
            await readDir(`${path}/${dirEntry.name}`, `${relative}${dirEntry.name}/`);
        }
    }
    if (missing.length > 0) {
        throw new Error("Missing metadata for " + missing.join(", "));
    }
}

await readDir(foundationPath, '');
// Write updated foundation metadata
Deno.writeTextFileSync(metaPath, safeDump(meta));
