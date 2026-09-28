# seurat.fi

Staattinen verkkosivu, joka lukee julkaistut seurat Firebase Firestore -kokoelmasta `publicStreams` ja soittaa ensimmäisen stream-linkin selaimessa.

## Paikallinen ajo

```powershell
npx serve -l 4173 web
```

Jos portti on varattu, `serve` valitsee vapaan portin ja tulostaa osoitteen.

## Ilmainen julkaisu

Cloudflare Pages:

1. Luo Pages-projekti olemassa olevasta GitHub-reposta.
2. Valitse build-komennoksi tyhjä arvo.
3. Aseta output-hakemistoksi `web`.

Cloudflare Worker julkaisee reitit `/api/streams` ja `/api/check`. Sivu pyytää seurat Workerilta, ja Worker hakee `publicStreams`-kokoelman Firestoresta sekä tarkistaa streamit palvelinpuolella ilman selaimen CORS-rajoituksia.

GitHub Pages toimii samalla rakenteella, kun julkaistavaksi kansioksi valitaan `web`.

Firestore-säännöissä kokoelman lukuoikeus on jo julkinen, joten selaimessa ei tarvita Firebase-salaisuutta. Ylläpito tehdään edelleen Android-hallintasovelluksella.

## Streamien tarkistus

Worker hakee `publicStreams`-kokoelman ja testaa streamit ennen kuin palauttaa ne sivulle. Sivu pyytää listan uudelleen viiden minuutin välein. Selain käsittelee vain Workerilta saamaansa jo tarkistettua listaa ja käyttää stream-osoitetta toistoa varten.

MP3 toimii selaimissa yleensä suoraan. M3U- ja M3U8-tuki riippuu selaimesta: Safari tukee HLS:ää natiivisti, kun taas Chrome ja Firefox tarvitsevat yleensä suoran selaimen tukeman audio-osoitteen tai erillisen HLS-soittimen. Staattinen sivu ei voi ohittaa selaimen media- tai CORS-rajoituksia.