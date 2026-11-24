# Balance

Odatlar, diqqat taymeri (Pomodoro / sekundomer), XP va yutuqlar, do'stlar va statistika
bitta ilovada. Lovable orqali qurilgan: TanStack Start + React + Tailwind + Supabase.

## Ishga tushirish

```sh
npm i        # yoki: bun i
npm run dev
npm test
```

Supabase loyihasini ulang va `drizzle/migrations/` ichidagi barcha fayllarni **tartib bilan**
(0000 dan 0012 gacha) bazaga qo'llang. Birortasi qo'llanmagan bo'lsa, odat qo'shish yoki
belgilash xato berishi mumkin.

## Migratsiyalar

| Fayl       | Nima qo'shadi                                          |
| ---------- | ------------------------------------------------------ |
| 0000, 0001 | Odatlar, kunlik belgilar, sessiyalar, sozlamalar       |
| 0002       | XP, yutuqlar, kunlik maqsad, eslatma jadvallari        |
| 0003       | Do'stlar, 6 xonali kod, so'rovlar                      |
| 0005       | Yuklash kuzatuvi, eslatmalar                           |
| 0006       | Tezlik uchun indekslar                                 |
| 0007       | Davrli XP va qaydlar uchun tezlik indekslari           |
| 0012       | O'tkazib yuborilgan kunlar va streak freeze maydonlari |

Barchasi faqat qo'shuvchi (`DROP` yo'q) va mavjud ma'lumotni o'chirmaydi.

## Xavfsizlik

- Har bir jadvalda Row Level Security yoqilgan.
- XP va yutuqlarni brauzer yoza olmaydi, faqat server triggerlari beradi.
- Do'st kodi qidiruvi rate-limit bilan himoyalangan.

## Push eslatmalar (ixtiyoriy)

Sozlash uchun Edge Function (`supabase/functions/send-reminders`), VAPID kalitlari va
cron kerak. Hammasi tayyor bo'lmaguncha ilova eslatmani "sozlanmagan" deb ko'rsatadi.

1. `supabase functions deploy send-reminders`
2. Supabase secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`
3. Funksiyani har daqiqada chaqiring (`Authorization: Bearer <CRON_SECRET>`)
4. Frontend muhitida `VITE_VAPID_PUBLIC_KEY` va `VITE_PUSH_REMINDERS_ENABLED=true`

Maxfiy kalitlarni hech qachon kodga yozmang.

## Google bilan kirish

Supabase Authentication'da Google'ni yoqing, OAuth client ID va secret'ni Supabase
sozlamalariga kiriting, redirect URL ro'yxatiga ilova manzilini qo'shing.
