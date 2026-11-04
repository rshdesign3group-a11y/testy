# مینی‌گیم‌ها — راهنمای کامل ارتقا و افزودن بازی

## ساختار
هر بازی یک پوشه در `games/` است با یک فایل `index.html` (می‌تواند فایل‌های کمکی هم داشته باشد). بازی داخل یک iframe باز می‌شود و ثبت‌شده‌ی آن در `js/arcade.js` (فهرست `GAMES`) است:

    dash: { id:"dash", name:"Carrot Dash", icon:"🥕", color:"#ff8a1f", url:"games/carrot-dash/index.html?embed=1", proto:"dash", v:1, hint:"" }

- `id` کلید داخلی (در ذخیره‌ی ادمین استفاده می‌شود؛ بعد از ساخت عوضش نکن)
- `name` / `icon` / `color` روی کابینت و بالای پنجره‌ی بازی دیده می‌شود
- `url` مسیر بازی (حتماً `?embed=1` داشته باشد)
- `proto` نوع پروتکل پرداخت: `"dash"` یا `"run"` (پایین‌تر توضیح داده شده)
- `v` شماره‌ی نسخه برای دور زدن کش مرورگر
- `hint` متن کوتاه زیر عنوان (مثلاً «گوشی را بچرخان»)

## ۱) ارتقای یکی از بازی‌های فعلی
۱. فایل جدید را جای `games/<پوشه>/index.html` بگذار (فایل قبلی را اول کپی بگیر).
۲. **بخش‌های ارتباط با سایت را نگه دار** (فقط همان‌ها؛ بقیه‌ی بازی هرچه خواستی عوض کن):
   - Carrot Dash: ارسال `carrot-dash:ready` هنگام شروع، `carrot-dash:delta` با `{amount, balance}` برای هر تغییر هویج (منفی = ورودی، مثبت = جایزه)، `carrot-dash:exit` برای دکمه‌ی خروج و `carrot-dash:out-of-carrots`، و گوش دادن به `carrot-dash:balance`.
   - Carrot Run: درخواست‌های `balance` / `spend` / `award` / `earnedToday` از طریق `postMessage` با `src:'rabbit-game'` و `id`، و خواندن پاسخ `src:'host'` با همان `id`.
   (در فایل‌های فعلی دنبال `postMessage` و `embed` بگرد؛ دست نزدن به آن خطوط کافی است.)
۳. در `js/arcade.js` عدد `v` همان بازی را یکی بالا ببر (`v:1` ← `v:2`) تا مرورگرها نسخه‌ی جدید را بگیرند.
۴. صفحه را Ctrl+F5 کن و هم در حالت عادی و هم با کد تست امتحان کن.
۵. اگر قوانین پول عوض شد (مثلاً هزینه‌ی ورود یا جایزه): هزینه و جایزه را **داخل بازی** تعیین می‌کنی؛ سایت فقط سقف سود روزانه را اعمال می‌کند (ادمین ← Arcade ← Max 🥕 profit per day).

## ۲) اضافه کردن یک بازی تازه
۱. پوشه بساز: `games/<اسم-بازی>/index.html`
۲. بازی را به یکی از دو پروتکل وصل کن (الگوها پایین‌تر):
   - **dash** (ساده): بازی موجودی را خودش جمع و کم می‌کند و تغییرها را اعلام می‌کند.
   - **run** (امن‌تر): بازی برای هر کار از سایت اجازه می‌گیرد (`spend` قبل از شروع، `award` در پایان، `earnedToday` برای سقف روزانه).
۳. در `js/arcade.js` داخل `GAMES` یک خط اضافه کن (id یکتا، `proto` یکی از دو نوع بالا).
۴. هیچ جای دیگری لازم نیست عوض شود: تب Arcade در ادمین خودش بازی جدید را در لیست انتخاب (کافه و لانه‌ها) نشان می‌دهد.
۵. در ادمین ← Arcade بازی را روی کافه یا یک لانه/طبقه بگذار و امتحان کن.

### الگوی پروتکل `run` (پیشنهادی برای بازی‌های تازه)
    function ask(type, data){ return new Promise(res=>{
      const id=Math.random().toString(36).slice(2);
      const on=e=>{ if(e.data&&e.data.src==='host'&&e.data.id===id){ removeEventListener('message',on); res(e.data); } };
      addEventListener('message',on); parent.postMessage({src:'rabbit-game',type,id,...data},'*'); }); }
    const {balance} = await ask('balance');
    const {ok} = await ask('spend',{amount:10, runId});                 // هزینه‌ی ورود؛ اگر ok نبود بازی شروع نشود
    await ask('award',{amount:15, runId, info:{profit:5}});              // amount = بازگشت ورودی + سود ؛ info.profit فقط سود
    const {earned} = await ask('earnedToday');                           // سود امروز (برای نمایش سقف)
`runId` برای هر دور باید یکتا باشد. سایت فقط **یک بار** بازگشت ورودی همان دور را قبول می‌کند و سود را به سقف روزانه محدود می‌کند.

### الگوی پروتکل `dash`
    parent.postMessage({type:'carrot-dash:ready'},'*');
    addEventListener('message',e=>{ if(e.data&&e.data.type==='carrot-dash:balance') bal=e.data.balance; });
    function change(d){ bal+=d; parent.postMessage({type:'carrot-dash:delta',amount:d,balance:bal},'*'); }
**نکته‌ی مهم:** سایت فقط وقتی `carrot-dash:balance` برمی‌گرداند که عدد بازی با عدد واقعی فرق داشته باشد. پس در هندلر `balance` فقط موجودی را به‌روز کن؛ اگر آنجا کل صفحه/منو را دوباره بکشی، وسط بازی منو برمی‌گردد (باگی که در Carrot Dash داشتیم).

## قواعد برای همه‌ی بازی‌ها
- بدون اینترنت خارجی: همه‌ی فایل‌ها داخل پوشه‌ی بازی باشد.
- کنترل لمسی و صفحه‌کلید هر دو داشته باشد؛ اندازه به پنجره بخورد (letterbox) تا روی گوشی خوب باشد.
- بازی «embedded» را از `window.parent !== window` یا `?embed=1` تشخیص بده؛ در حالت embedded موجودی از سایت می‌آید (نه ذخیره‌ی محلی).
- فقط بازی‌های خودت را اینجا بگذار (iframe با دسترسی same-origin اجرا می‌شود).
- پرداخت‌ها در این نسخه سمت مرورگر است؛ با سرور واقعی باید سمت سرور اعتبارسنجی شود.
