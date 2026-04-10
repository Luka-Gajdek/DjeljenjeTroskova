# Dijeljenje Troskova (Firebase + GitHub Pages)

Mobilna web aplikacija za dijeljenje troskova (Split/Splid stil) s real-time sinkronizacijom preko Firestore baze.

## Sto je u MVP-u

- Kreiranje grupe preko URL hash-a (npr. `#ab12cd...`)
- Dodavanje clanova
- Dodavanje, izmjena i brisanje troskova
- Jednaka podjela troska na odabrane sudionike
- Izracun salda i prijedlog poravnanja (tko kome placa)
- Share link za grupu

## 1) Firebase setup

1. Otvori [Firebase Console](https://console.firebase.google.com/).
2. Kreiraj projekt.
3. U projektu ukljuci `Firestore Database` (Production ili Test mode).
4. U `Project settings -> General -> Your apps` dodaj `Web app`.
5. Kopiraj konfiguraciju i upisi je u [firebase-config.js](firebase-config.js).

Primjer:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 2) Firestore Rules (MVP demo)

Za brz MVP bez login-a, stavi privremeno pravila:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{groupId} {
      allow read, write: if true;
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
}
```

Upozorenje: ovo je otvoreno svima koji znaju link. Za ozbiljnu produkciju dodaj autentikaciju i stroza pravila.

## 3) Lokalno testiranje

Mozes otvoriti [index.html](index.html) direktno ili preko Live Server ekstenzije.

## 4) Deploy na GitHub Pages

1. Pushaj sve datoteke u GitHub repo.
2. U repo postavkama otvori `Settings -> Pages`.
3. Pod `Build and deployment` odaberi `Deploy from a branch`.
4. Odaberi branch `main` i folder `/ (root)`.
5. Nakon deploya dobijes URL, npr. `https://username.github.io/repo/`.

Share link grupe izgleda ovako:

`https://username.github.io/repo/#<groupId>`

Svi koji otvore isti link vide istu grupu i iste troskove.

## Struktura

- [index.html](index.html): UI
- [styles.css](styles.css): dizajn i responsive stilovi
- [app.js](app.js): Firebase logika, CRUD, kalkulacije
- [firebase-config.js](firebase-config.js): tvoja Firebase konfiguracija
