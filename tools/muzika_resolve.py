#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════
# KARTI — tools/muzika_resolve.py
#
# Builds data/muzika-tracks.json, the song bank for the MUŻIKA clip
# round. It writes METADATA ONLY. No audio file is ever downloaded and
# nothing is added to audio/ — the game streams Apple's own 30-second
# preview at play time, which is what keeps a live public build clear
# of any licensing question.
#
# Run:  python3 tools/muzika_resolve.py            (whole bank)
#       python3 tools/muzika_resolve.py --only pop (one shelf)
#
# The Search API is rate-limited (~20 calls/min is the published
# guidance), so this sleeps between calls and backs off on a 403. A
# full run takes a few minutes. That is fine; it runs once, not per
# game.
# ═══════════════════════════════════════════════════════════════════
import json, sys, time, unicodedata, urllib.parse, urllib.request, os

SEARCH = 'https://itunes.apple.com/search'
OUT    = os.path.join(os.path.dirname(__file__), '..', 'data', 'muzika-tracks.json')
DELAY  = 1.5          # seconds between calls — be a good citizen
COUNTRY= 'MT'         # Malta storefront: local catalogue + local availability

# ── the curated list ───────────────────────────────────────────────
# Shelves match the four CATS already in js/muzika.js, so nothing
# downstream has to learn a new vocabulary:
#   pop      = what is on the radio now ("trendy")
#   klassiku = old school
#   nisa     = the women
#   rap      = rap
#   malta    = local + Eurovision, because this is a Maltese game
SONGS = {
'pop': [
 ("Shape of You","Ed Sheeran"), ("Perfect","Ed Sheeran"),
 ("Thinking Out Loud","Ed Sheeran"), ("Blinding Lights","The Weeknd"),
 ("Save Your Tears","The Weeknd"), ("Bad Guy","Billie Eilish"),
 ("Levitating","Dua Lipa"), ("Don't Start Now","Dua Lipa"),
 ("Anti-Hero","Taylor Swift"), ("Cruel Summer","Taylor Swift"),
 ("As It Was","Harry Styles"), ("Watermelon Sugar","Harry Styles"),
 ("Uptown Funk","Mark Ronson"), ("Happy","Pharrell Williams"),
 ("Shallow","Lady Gaga"), ("Despacito","Luis Fonsi"),
 ("Viva La Vida","Coldplay"), ("Yellow","Coldplay"),
 ("Sunflower","Post Malone"), ("Circles","Post Malone"),
 ("Believer","Imagine Dragons"), ("Radioactive","Imagine Dragons"),
 ("Counting Stars","OneRepublic"), ("Wake Me Up","Avicii"),
 ("Titanium","David Guetta"), ("Stay","The Kid LAROI"),
 ("Heat Waves","Glass Animals"), ("Dance Monkey","Tones and I"),
 ("Old Town Road","Lil Nas X"), ("Senorita","Shawn Mendes"),
 ("Havana","Camila Cabello"), ("Cheap Thrills","Sia"),
 ("Chandelier","Sia"), ("Take Me to Church","Hozier"),
 ("Rather Be","Clean Bandit"), ("Get Lucky","Daft Punk"),
 ("Shut Up and Dance","Walk the Moon"),
 ("Can't Stop the Feeling","Justin Timberlake"),
 ("Sorry","Justin Bieber"), ("Love Yourself","Justin Bieber"),
 ("Flowers","Miley Cyrus"), ("Unholy","Sam Smith"),
 ("Calm Down","Rema"), ("Espresso","Sabrina Carpenter"),
 ("Paint The Town Red","Doja Cat"),
],
'klassiku': [
 ("Bohemian Rhapsody","Queen"), ("Don't Stop Me Now","Queen"),
 ("We Will Rock You","Queen"), ("Imagine","John Lennon"),
 ("Hey Jude","The Beatles"), ("Let It Be","The Beatles"),
 ("Come Together","The Beatles"), ("Stairway to Heaven","Led Zeppelin"),
 ("Hotel California","Eagles"), ("Billie Jean","Michael Jackson"),
 ("Beat It","Michael Jackson"), ("Thriller","Michael Jackson"),
 ("Dancing Queen","ABBA"), ("Mamma Mia","ABBA"),
 ("Sweet Child O' Mine","Guns N' Roses"), ("Wonderwall","Oasis"),
 ("Smells Like Teen Spirit","Nirvana"), ("Sweet Dreams","Eurythmics"),
 ("Every Breath You Take","The Police"), ("Africa","Toto"),
 ("Livin' On A Prayer","Bon Jovi"), ("Summer of '69","Bryan Adams"),
 ("I Want It That Way","Backstreet Boys"), ("Wannabe","Spice Girls"),
 ("Barbie Girl","Aqua"), ("Comfortably Numb","Pink Floyd"),
 ("Another Brick in the Wall","Pink Floyd"), ("Purple Rain","Prince"),
 ("Superstition","Stevie Wonder"), ("Let's Dance","David Bowie"),
 ("Heroes","David Bowie"), ("Born to Run","Bruce Springsteen"),
 ("Sultans of Swing","Dire Straits"), ("With or Without You","U2"),
 ("Losing My Religion","R.E.M."), ("Creep","Radiohead"),
 ("Zombie","The Cranberries"), ("No Woman No Cry","Bob Marley"),
 ("Could You Be Loved","Bob Marley"), ("Y.M.C.A.","Village People"),
],
'nisa': [
 ("Like a Prayer","Madonna"), ("Vogue","Madonna"),
 ("Material Girl","Madonna"), ("I Will Always Love You","Whitney Houston"),
 ("I Wanna Dance with Somebody","Whitney Houston"),
 ("Respect","Aretha Franklin"), ("...Baby One More Time","Britney Spears"),
 ("Toxic","Britney Spears"), ("Believe","Cher"),
 ("Crazy In Love","Beyonce"), ("Single Ladies","Beyonce"),
 ("Halo","Beyonce"), ("Rehab","Amy Winehouse"),
 ("Valerie","Amy Winehouse"), ("Genie in a Bottle","Christina Aguilera"),
 ("Torn","Natalie Imbruglia"), ("Umbrella","Rihanna"),
 ("Diamonds","Rihanna"), ("We Found Love","Rihanna"),
 ("Firework","Katy Perry"), ("Roar","Katy Perry"),
 ("Poker Face","Lady Gaga"), ("Bad Romance","Lady Gaga"),
 ("Wrecking Ball","Miley Cyrus"), ("Hollaback Girl","Gwen Stefani"),
 ("Complicated","Avril Lavigne"), ("Ironic","Alanis Morissette"),
 ("Black Velvet","Alannah Myles"), ("It's Raining Men","The Weather Girls"),
 ("I Will Survive","Gloria Gaynor"),
 ("Girls Just Want to Have Fun","Cyndi Lauper"),
 ("Total Eclipse of the Heart","Bonnie Tyler"),
 ("What's Love Got to Do with It","Tina Turner"),
 ("The Power of Love","Jennifer Rush"), ("Set Fire to the Rain","Adele"),
 ("Hello","Adele"), ("Rolling in the Deep","Adele"),
 ("Someone Like You","Adele"),
],
'rap': [
 ("Lose Yourself","Eminem"), ("Without Me","Eminem"),
 ("Stan","Eminem"), ("The Real Slim Shady","Eminem"),
 ("Love The Way You Lie","Eminem"), ("In Da Club","50 Cent"),
 ("Gold Digger","Kanye West"), ("Stronger","Kanye West"),
 ("Juicy","The Notorious B.I.G."), ("California Love","2Pac"),
 ("Changes","2Pac"), ("Empire State of Mind","Jay-Z"),
 ("99 Problems","Jay-Z"), ("HUMBLE.","Kendrick Lamar"),
 ("Alright","Kendrick Lamar"), ("God's Plan","Drake"),
 ("Hotline Bling","Drake"), ("One Dance","Drake"),
 ("SICKO MODE","Travis Scott"), ("Hey Ya!","OutKast"),
 ("Ms. Jackson","OutKast"), ("Rapper's Delight","The Sugarhill Gang"),
 ("Walk This Way","Run-DMC"), ("Nuthin' But A G Thang","Dr. Dre"),
 ("Still D.R.E.","Dr. Dre"), ("Forgot About Dre","Dr. Dre"),
 ("Jump Around","House of Pain"), ("Can't Hold Us","Macklemore"),
 ("Thrift Shop","Macklemore"), ("Where Is The Love","Black Eyed Peas"),
 ("I Gotta Feeling","Black Eyed Peas"), ("Airplanes","B.o.B"),
 ("Mask Off","Future"), ("Bodak Yellow","Cardi B"),
 ("Super Bass","Nicki Minaj"), ("Industry Baby","Lil Nas X"),
],
'malta': [
 ("7th Wonder","Ira Losco"), ("Walk on Water","Ira Losco"),
 ("Je Me Casse","Destiny"), ("All of My Love","Destiny"),
 ("I Am What I Am","Emma Muscat"), ("Chameleon","Michela"),
 ("Tomorrow","Gianluca Bezzina"), ("This Is the Night","Kurt Calleja"),
 ("Angel","Chiara"), ("The One That I Love","Chiara"),
 ("Warrior","Amber"), ("I Do","Fabrizio Faniello"),
 ("One Life","Glen Vella"), ("Dance (Our Own Party)","Aidan"),
 ("Breathlessly","Claudia Faniello"),
],
}


def fetch(term, limit=5):
    q = urllib.parse.urlencode({
        'term': term, 'media': 'music', 'entity': 'song',
        'limit': limit, 'country': COUNTRY,
    })
    req = urllib.request.Request(SEARCH + '?' + q,
                                 headers={'User-Agent': 'KARTI/muzika-resolver'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r).get('results', [])


def norm(s):
    """Fold accents before comparing. Beyonce/Beyonce and Senorita/Senorita
    are the same name to a player, and the catalogue spells them with the
    diacritic while a curated list rarely does."""
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return ''.join(ch for ch in s.lower() if ch.isalnum())


def pick(results, title, artist):
    """Best match: artist must line up, then prefer the closest title.
    A wrong match is worse than a miss — it puts a song in the bank
    under the wrong name and the game then marks a correct answer
    wrong, which is the one bug a quiz must never have."""
    nt, na = norm(title), norm(artist)
    best = None
    for r in results:
        if not r.get('previewUrl'):
            continue
        rt, ra = norm(r.get('trackName')), norm(r.get('artistName'))
        if na not in ra and ra not in na:
            continue
        score = 2 if rt == nt else (1 if nt in rt or rt in nt else 0)
        if score == 0:
            continue
        if best is None or score > best[0]:
            best = (score, r)
    return best[1] if best else None


def main():
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1]

    bank, misses = [], []
    shelves = {k: v for k, v in SONGS.items() if only in (None, k)}
    total = sum(len(v) for v in shelves.values())
    done = 0

    for shelf, items in shelves.items():
        for title, artist in items:
            done += 1
            try:
                res = fetch(f'{title} {artist}')
                hit = pick(res, title, artist)
            except Exception as e:
                print(f'  !! {title} — {artist}: {e}', flush=True)
                misses.append((shelf, title, artist, str(e)))
                time.sleep(DELAY * 3)
                continue

            if not hit:
                print(f'  -- MISS {title} — {artist}', flush=True)
                misses.append((shelf, title, artist, 'no match with preview'))
            else:
                bank.append({
                    'k':       shelf,
                    'id':      hit['trackId'],
                    'title':   hit['trackName'],
                    'artist':  hit['artistName'],
                    'year':    int((hit.get('releaseDate') or '0000')[:4] or 0),
                    'preview': hit['previewUrl'],
                    'art':     (hit.get('artworkUrl100') or '').replace('100x100', '300x300'),
                    'url':     hit.get('trackViewUrl', ''),
                })
                print(f'  ok [{done}/{total}] {hit["trackName"]} — {hit["artistName"]}', flush=True)
            time.sleep(DELAY)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'tracks': bank}, f, ensure_ascii=False, indent=1)

    print(f'\nwrote {len(bank)} tracks -> {os.path.relpath(OUT)}')
    by = {}
    for t in bank:
        by[t['k']] = by.get(t['k'], 0) + 1
    print('per shelf:', by)
    if misses:
        print(f'\n{len(misses)} misses:')
        for m in misses:
            print('  ', m[0], '|', m[1], '—', m[2], '|', m[3])


if __name__ == '__main__':
    main()
