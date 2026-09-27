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

`web/functions/api/check.js` julkaistaan samalla Pages-projektilla osoitteeseen `/api/check`, joten streamit voidaan testata palvelinpuolella ilman selaimen CORS-rajoituksia.

GitHub Pages toimii samalla rakenteella, kun julkaistavaksi kansioksi valitaan `web`.

Firestore-säännöissä kokoelman lukuoikeus on jo julkinen, joten selaimessa ei tarvita Firebase-salaisuutta. Ylläpito tehdään edelleen Android-hallintasovelluksella.

## Streamien tarkistus

Sivu hakee `publicStreams`-kokoelman aina latautuessaan ja testaa streamit selaimen audioelementillä ennen niiden näyttämistä. Tarkistus tehdään uudelleen viiden minuutin välein.

MP3 toimii selaimissa yleensä suoraan. M3U- ja M3U8-tuki riippuu selaimesta: Safari tukee HLS:ää natiivisti, kun taas Chrome ja Firefox tarvitsevat yleensä suoran selaimen tukeman audio-osoitteen tai erillisen HLS-soittimen. Staattinen sivu ei voi ohittaa selaimen media- tai CORS-rajoituksia.