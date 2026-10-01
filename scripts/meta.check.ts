// node scripts/meta.check.ts
import assert from "node:assert/strict"
import { cleanTitle, norm } from "../src/lib/meta/title.ts"

assert.deepEqual(cleanTitle("AR - The Weight (2023) 4K"), { title: "The Weight", year: "2023" })
assert.deepEqual(cleanTitle("|EN| Hellfire [FHD]"), { title: "Hellfire", year: undefined })
assert.deepEqual(cleanTitle("Coyote vs Acme"), { title: "Coyote vs Acme", year: undefined })
assert.equal(cleanTitle("Blade Runner 2049").title, "Blade Runner 2049") // bare numbers are part of the title
assert.equal(cleanTitle("Wonder Woman 1984 (2020)").year, "2020")
assert.equal(cleanTitle("Movie 12").title, "Movie 12")
assert.equal(norm("The Widower: 'Til Death Do Us Part"), norm("the widower til death do us part (2024)"))
console.log("meta ok")
