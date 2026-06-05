# Share-card bundled fonts

`src/lib/fonts.ts` reads the following files from this directory and feeds them to `satori`'s `fonts` option:

| File                             | Family       | Weight | Style  |
| -------------------------------- | ------------ | ------ | ------ |
| `Geist-Regular.subset.ttf`       | `Geist`      | 400    | normal |
| `Geist-Medium.subset.ttf`        | `Geist`      | 500    | normal |
| `Geist-SemiBold.subset.ttf`      | `Geist`      | 600    | normal |
| `Geist-Bold.subset.ttf`          | `Geist`      | 700    | normal |
| `GeistMono-Regular.subset.ttf`   | `Geist Mono` | 400    | normal |
| `GeistMono-Medium.subset.ttf`    | `Geist Mono` | 500    | normal |

## Subsetting procedure

1. Download Geist and Geist Mono from <https://vercel.com/font> (OFL-licensed).
2. Subset each face to U+0020–U+007E (Latin + digits + common punctuation), e.g.

   ```sh
   pyftsubset Geist-Regular.ttf \
     --unicodes=U+0020-007E \
     --output-file=Geist-Regular.subset.ttf
   ```

3. Drop the subset `.ttf` files into this directory using the names in the table above.

The card never renders user descriptions in non-Latin scripts (`@workspace/description-sanitizer` strips non-Latin code points) and the Score is digits-only, so a Latin + digit subset is sufficient to render every card.

## Why the subsets are not checked in

Geist is OFL-licensed and may be redistributed, but raw font binaries diff poorly and inflate `pnpm install` time. Subsetting is a one-time build artifact step and is run by the deployment pipeline; commit the resulting `.ttf` files alongside this README once the subsetting workflow is wired (tracked under task 12.1 follow-up).
