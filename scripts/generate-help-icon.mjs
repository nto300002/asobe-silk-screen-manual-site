import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HiOutlineQuestionMarkCircle } from "react-icons/hi2";
import { FiCamera, FiEdit2, FiTrash2 } from "react-icons/fi";
import { writeFileSync } from "node:fs";

const svg = renderToStaticMarkup(createElement(HiOutlineQuestionMarkCircle, {
  size: 24,
  color: "#5d8a67",
  "aria-hidden": "true",
}));

writeFileSync(new URL("../public/help-icon.svg", import.meta.url), `${svg}\n`);

for (const [name, Icon] of [["camera", FiCamera], ["edit", FiEdit2], ["trash", FiTrash2]]) {
  const icon = renderToStaticMarkup(createElement(Icon, { size: 20, color: name === "trash" ? "#bd4d42" : "#426d4b", "aria-hidden": "true" }));
  writeFileSync(new URL(`../public/${name}-icon.svg`, import.meta.url), `${icon}\n`);
}
