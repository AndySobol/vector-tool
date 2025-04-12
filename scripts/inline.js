const fs = require("fs");
const path = require("path");

const bundlePath = path.join(__dirname, "../build/bundle.js");
const htmlPath = path.join(__dirname, "../build/ui.html");
const indexHtmlPath = path.join(__dirname, "../ui/index.html");

try {
  // Копируем index.html в build/ui.html
  fs.copyFileSync(indexHtmlPath, htmlPath);

  const bundleContent = fs.readFileSync(bundlePath, "utf8");
  let html = fs.readFileSync(htmlPath, "utf8");
  // Заменяем плейсхолдер __INLINE_BUNDLE__ на инлайновый скрипт
  html = html.replace("__INLINE_BUNDLE__", `<script>${bundleContent}</script>`);
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("HTML успешно обновлён");
} catch (err) {
  console.error("Ошибка при инлайне JS в HTML:", err);
}
