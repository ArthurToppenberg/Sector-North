# City image credits

The info window for a major city shows a photograph of a landmark that stands for that
city. Images are downscaled for the bundle (originals linked below) but kept in colour.
Where the licence requires attribution it is also surfaced in-game as a small caption on
each image (the CC BY-SA / CC BY licences); the CC0 images carry no obligation but are
credited here anyway.

| City | Landmark | Image | Author | Licence |
| --- | --- | --- | --- | --- |
| Copenhagen | Nyhavn at sunset | [2018 - Nyhavn on sunset.jpg](https://commons.wikimedia.org/wiki/File:2018_-_Nyhavn_on_sunset.jpg) | Moahim | CC BY-SA 4.0 |
| Aarhus | ARoS — *Your Rainbow Panorama* | [2011-05-29 014 Your rainbow panorama at ARoS Aarhus Kunstmuseum.jpg](https://commons.wikimedia.org/wiki/File:2011-05-29_014_Your_rainbow_panorama_at_ARoS_Aarhus_Kunstmuseum.jpg) | Gordon Leggett | CC BY-SA 4.0 |
| Odense | Hans Christian Andersen's house | [Hans Christian Andersens house in Odense.jpg](https://commons.wikimedia.org/wiki/File:Hans_Christian_Andersens_house_in_Odense.jpg) | Bo Jessen | CC0 |
| Aalborg | Utzon Center | [Utzon Center, Aalborg - DSC08507.jpg](https://commons.wikimedia.org/wiki/File:Utzon_Center,_Aalborg_-_DSC08507.jpg) | Daderot | CC0 |
| Esbjerg | *Mennesket ved Havet* (Men at Sea) | [Mennesket ved havet tramonto.JPG](https://commons.wikimedia.org/wiki/File:Mennesket_ved_havet_tramonto.JPG) | Jazia | CC BY-SA 4.0 |

## ShareAlike note

The Copenhagen, Aarhus and Esbjerg images are **CC BY-SA**: the downscaled copies bundled
here are derivatives and remain under the same licence. Using them (including in a paid
build) is fine with the attribution above; the images themselves stay CC BY-SA. The Odense
and Aalborg images are **CC0** (public domain dedication) — no attribution is required, but
it is given above and in `src/game/cityImages.ts` as a courtesy.

## Adding or changing a city image

Drop the file in this folder and register it in `src/game/cityImages.ts` (texture key +
credit). Every current city has a photo; a city with no usable image is a valid case —
`cityImageAsset` returns `null` and its window shows the "NO IMAGE" placeholder, exactly
like the radar sites without a photo.
