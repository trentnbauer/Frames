# Wiki draft: changes from the QA and security round

For publication in the wiki. Merge each section into the guide named in its heading.

## Sign-in and access: signing in with a provider

A sign-in through an OAuth or OpenID provider is only accepted in the browser that started it (a short-lived cookie, `frames_flow`, is set when you choose the provider). Opening the provider's return address in another browser or device shows "This sign-in was not started in this browser. Please start again." Start the sign-in again from the sign-in page in the browser you want to use.

## Photos and tags: camera names are not tags

Camera, lens and film names are read from the photograph's details by search, not copied into tags. A one-time upgrade step removes tags that only repeat the photograph's own camera, lens or film name, including ones typed by hand. The AI is no longer asked for wide angle, regular or telephoto, and its tags are tidied of filler words, repeated words and near-twins (mist and misty).

## Search

Search shows the matching photographs straight away. If an AI is set up for search, it reads the sentence afterwards and narrows the results when it answers; if it does not answer within about six seconds the results stay as they are.

## Compositions

- A new composition starts with print sizes the best photograph in its pool can fill at 300 PPI (A-series sizes only); raise them in the editor.
- Moving a composition to Review or Done asks first if any print is below the sharpness setting. On a phone the same prints are listed on the composition page.
- Wall sizes show one decimal everywhere (0.9 × 0.6 m).

## Statistics and To do

- "In compositions" counts photographs chosen for a print, not every candidate.
- On a phone, To do shows the same total as the desktop, and each row counts every photograph missing that thing. Opening a row still walks through the photographs it is first in line for.

## Recently removed

A removed photograph keeps a small copy for the recovery period (30 days by default, set under Recently removed), shown next to its Restore button. The copy is deleted with the entry.
