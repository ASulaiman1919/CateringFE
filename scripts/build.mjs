import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { build } from "esbuild";

const html = await readFile("index.html", "utf8");
const $ = load(html);
const menu = $(".menu-item").map((_, item) => ({
  name: $(item).find("[data-dish]").attr("data-dish"),
  description: $(item).find("p").text().trim(),
  category: $(item).closest(".menu-panel").find("h3").text().trim()
})).get();
if (!menu.length || menu.some((dish) => !dish.name || !dish.description)) {
  throw new Error("The order assistant needs a complete menu.");
}
await mkdir("netlify/data", { recursive: true });
await writeFile("netlify/data/menu.json", JSON.stringify(menu, null, 2) + "\n");
// Only public website files go into the deployment, never private output or server code.
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const path of ["index.html", "thank-you.html", "styles.css", "script.js", "order-assistant.js", "order-assistant.css", "order-planner.css", "favicon.svg", "assets"]) {
  await cp(path, "dist/" + path, { recursive: true });
}
for (const icon of ['user-round', 'shopping-bag', 'minus', 'pencil', 'trash-2', 'download', 'arrow-left', 'flower-2', 'camera']) {
  await cp(`node_modules/lucide-static/icons/${icon}.svg`, `dist/assets/icons/${icon}.svg`);
}
await build({ entryPoints: ['order-planner.js', 'customer-account.js'], bundle: true, outdir: 'dist', platform: 'browser', format: 'iife', target: ['es2022'], minify: true });
console.log(`Built website and assistant knowledge for ${menu.length} dishes.`);
