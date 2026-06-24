import { generateFonts } from "fantasticon"
import config from "../fantasticonrc.js"

await generateFonts(config)
console.log("Built assets/icons/kilo-icon-font.woff2")
