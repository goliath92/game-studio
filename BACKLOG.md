# Backlog

## Solitaire
- [x] Destede görünen kart, çift tıklayarak doğrudan toplanabilsin (foundation'a). Oyun alanına (tableau) koymadan direkt yukarı gitsin. *(Zaten mevcut — 400ms çift tık ile waste/tableau'dan foundation'a taşıma var)*

## Mahjong
- [x] "Yeni Oyun" butonu, İpucu butonuyla aynı tasarımda olsun ve İpucu butonunun soluna taşınsın (şu an sağ altta ayrı stilde duruyor).

## Sudoku
- [x] "Sudoku" başlığını oyun içinden kaldır (oyuncu çubuğunda zaten var).
- [x] Rastgele|Günlük ve ⚙ üst satırda, sağ sütunun sağ kenarına hizalı.
- [x] Masaüstünde tahta kullanılabilir yüksekliğin tamamını kullansın; her yönde en az 32px boşluk, sayfa kaydırması yok.
- [x] Hata/süre satırını tahtanın üstünden kaldır, sağ sütuna taşı.
- [x] Sağ sütun: tahtanın üst kenarıyla hizalı, tahta yüksekliğine yayılsın, dikey ayırıcı çizgi yok. Sıra: bilgi bloğu (Günlük'te gün+zorluk+seri, Rastgele'de zorluk menüsü; altında hata+süre) → araçlar 2×2 (Geri Al, Sil, Not, İpucu+rozet) → 3×3 rakam tuşları (kalan sayı rozetli, tamamlanan soluk) → Rastgele'de "Yeni Oyun" ikincil stilde (devam eden oyunda onay).
- [x] ⚙ paneli: sağ kenarına hizalı popover, tema renkleriyle uyumlu (koyu temada beyaz panel olmasın), gölge+8px köşe, dışarı/Esc/⚙ ile kapansın, tema seçimi anında uygulansın panel açık kalsın, ileride genişleyebilir yapı.
- [x] Varsayılan tema sitenin keçe/pirinç/kâğıt görünümü olsun. Rakamlar Young Serif, etiketler Manrope.
- [x] Mobil (<768px): tek sütun; üst satır → bilgi → tahta → araçlar (tek satır 4) → rakamlar (tek satır 9) → Yeni Oyun ikon olarak üst satırda. ⚙ paneli bottom sheet olsun. Dokunma hedefleri min 44×44px.
- [x] Doğrulama: 1366×768, 1920×1080, 390×844'te Rastgele+Günlük; sağ sütun hizası, kaydırma yok, gün/zorluk/seri, kalan sayılar, ⚙ paneli tema uyumu, klavye kısayolları ve kayıt bütünlüğü.
