const BASE_URL = "https://oploverz.site"

const cache = new Map()

const CACHE_TTL = 5 * 60 * 1000

function getCache(key) {
    const item = cache.get(key)

    if (!item) return null

    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(key)
        return null
    }

    return item.data
}

function setCache(key, data) {
    cache.set(key, {
        time: Date.now(),
        data
    })
}

async function fetchHTML(url) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000)
    })

    if (!response.ok) {
        throw new Error(`Oploverz HTTP ${response.status}`)
    }

    return await response.text()
}

function decode(value) {
    if (!value) return value

    return String(value)
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\u0026/g, "&")
        .replace(/\\u002F/g, "/")
        .replace(/\\u003C/g, "<")
        .replace(/\\u003E/g, ">")
        .replace(/\\u0027/g, "'")
        .trim()
}

function cleanSlug(slug) {
    return String(slug || "")
        .trim()
        .replace(/^\/+|\/+$/g, "")
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractSeries(html) {
    const match = html.match(
        /series:\{id:(\d+),seriesId:(\d+),title:"([^"]*)",japaneseTitle:"([^"]*)",slug:"([^"]*)",description:"(.*?)",/
    )

    if (!match) {
        throw new Error("Data series tidak ditemukan")
    }

    const id = Number(match[1])
    const seriesId = Number(match[2])
    const title = decode(match[3])
    const japaneseTitle = decode(match[4])
    const slug = decode(match[5])
    const description = decode(match[6])

    const seriesStart = match.index
    const remaining = html.slice(seriesStart, seriesStart + 20000)

    const type =
        remaining.match(/type:"([^"]*)"/)?.[1] ||
        remaining.match(/type:'([^']*)'/)?.[1] ||
        null

    const studio =
        remaining.match(/studio:"([^"]*)"/)?.[1] ||
        remaining.match(/studio:'([^']*)'/)?.[1] ||
        null

    const status =
        remaining.match(/status:"([^"]*)"/)?.[1] ||
        remaining.match(/status:'([^']*)'/)?.[1] ||
        null

    const duration =
        remaining.match(/duration:"([^"]*)"/)?.[1] ||
        remaining.match(/duration:'([^']*)'/)?.[1] ||
        null

    const scoreMatch = remaining.match(/score:([0-9]+(?:\.[0-9]+)?)/)

    const poster =
        remaining.match(/poster:"(https?:\/\/[^"]+)"/)?.[1] ||
        remaining.match(/image:"(https?:\/\/[^"]+)"/)?.[1] ||
        remaining.match(/https:\/\/backapi\.oploverz\.ac\/uploads\/posters\/[^"\\]+/)?.[0] ||
        null

    const genreBlock = remaining.match(/genre:\[(.*?)\]/)

    const genres = genreBlock
        ? [...genreBlock[1].matchAll(/"([^"]+)"/g)]
            .map(x => decode(x[1]))
            .filter(Boolean)
        : []

    return {
        id,
        seriesId,
        title,
        japaneseTitle,
        slug,
        description,
        poster,
        type: type ? decode(type) : null,
        studio: studio ? decode(studio) : null,
        status: status ? decode(status) : null,
        score: scoreMatch ? Number(scoreMatch[1]) : null,
        duration: duration ? decode(duration) : null,
        genres
    }
}

function extractEpisodes(html) {
    const episodes = []
    const seen = new Set()

    const regex =
        /\{id:(\d+),subbed:"([^"]*)",title:(?:"([^"]*)"|null),episodeNumber:"([^"]*)"/g

    let match

    while ((match = regex.exec(html)) !== null) {
        const id = Number(match[1])

        if (seen.has(id)) continue

        seen.add(id)

        episodes.push({
            id,
            subbed: decode(match[2]),
            title: match[3] ? decode(match[3]) : null,
            episodeNumber: decode(match[4])
        })
    }

    episodes.sort((a, b) => {
        const aa = Number(a.episodeNumber)
        const bb = Number(b.episodeNumber)

        if (Number.isNaN(aa) || Number.isNaN(bb)) {
            return String(a.episodeNumber).localeCompare(String(b.episodeNumber))
        }

        return aa - bb
    })

    return episodes
}

function extractEpisode(html, episodeNumber) {
    const number = escapeRegex(episodeNumber)

    const regex = new RegExp(
        `episode:\\{id:(\\d+),subbed:"([^"]*)",title:(?:"([^"]*)"|null),episodeNumber:"${number}"`
    )

    const match = html.match(regex)

    if (!match) return null

    return {
        id: Number(match[1]),
        subbed: decode(match[2]),
        title: match[3] ? decode(match[3]) : null,
        episodeNumber: decode(match[4])
    }
}

function extractReleasedAt(html, episodeNumber) {
    const number = escapeRegex(episodeNumber)

    const regex = new RegExp(
        `episode:\\{id:\\d+,subbed:"[^"]*",title:(?:"[^"]*"|null),episodeNumber:"${number}",[^}]*?releasedAt:"([^"]*)"`
    )

    const match = html.match(regex)

    return match ? decode(match[1]) : null
}

export async function getAnime(slug) {
    const clean = cleanSlug(slug)

    if (!clean) {
        throw new Error("Slug anime wajib diisi")
    }

    const cacheKey = `anime:${clean}`

    const cached = getCache(cacheKey)

    if (cached) {
        return {
            ...cached,
            cached: true
        }
    }

    const url = `${BASE_URL}/series/${encodeURIComponent(clean)}`
    const html = await fetchHTML(url)

    const series = extractSeries(html)
    const episodes = extractEpisodes(html)

    const result = {
        source: "oploverz",
        url,
        cached: false,
        series,
        episodes,
        totalEpisodes: episodes.length
    }

    setCache(cacheKey, result)

    return result
}

export async function getEpisode(slug, episodeNumber) {
    const clean = cleanSlug(slug)
    const number = String(episodeNumber || "").trim()

    if (!clean) {
        throw new Error("Slug anime wajib diisi")
    }

    if (!number) {
        throw new Error("Nomor episode wajib diisi")
    }

    const cacheKey = `episode:${clean}:${number}`

    const cached = getCache(cacheKey)

    if (cached) {
        return {
            ...cached,
            cached: true
        }
    }

    const url = `${BASE_URL}/series/${encodeURIComponent(clean)}/episode/${encodeURIComponent(number)}`
    const html = await fetchHTML(url)

    const series = extractSeries(html)
    const episode = extractEpisode(html, number)

    if (!episode) {
        throw new Error(`Episode ${number} tidak ditemukan`)
    }

    const releasedAt = extractReleasedAt(html, number)

    const result = {
        source: "oploverz",
        url,
        cached: false,
        series,
        episode: {
            ...episode,
            releasedAt
        }
    }

    setCache(cacheKey, result)

    return result
}

export async function searchAnime(query, page = 1) {
    const keyword = String(query || "").trim().toLowerCase()

    if (!keyword) {
        throw new Error("Query pencarian wajib diisi")
    }

    const cacheKey = `search:${keyword}:${page}`

    const cached = getCache(cacheKey)

    if (cached) {
        return {
            ...cached,
            cached: true
        }
    }

    const url = `${BASE_URL}/series`
    const html = await fetchHTML(url)

    const results = []
    const seen = new Set()

    const regex =
        /href="\/series\/([^"]+)"[^>]*>([\s\S]{0,3000}?)<\/a>/g

    let match

    while ((match = regex.exec(html)) !== null) {
        const slug = decode(match[1])

        if (!slug || seen.has(slug)) continue

        const block = match[2]
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()

        const normalized = `${slug} ${block}`.toLowerCase()

        if (!normalized.includes(keyword)) continue

        seen.add(slug)

        results.push({
            title: block || slug,
            slug,
            url: `${BASE_URL}/series/${slug}`
        })
    }

    const result = {
        source: "oploverz",
        query: keyword,
        page: Number(page) || 1,
        total: results.length,
        results
    }

    setCache(cacheKey, result)

    return result
}

export async function healthCheck() {
    const started = Date.now()

    const html = await fetchHTML(BASE_URL)

    return {
        status: "ok",
        source: BASE_URL,
        responseTime: `${Date.now() - started}ms`,
        reachable: Boolean(html)
    }
}
