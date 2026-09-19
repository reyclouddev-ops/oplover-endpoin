import express from "express"
import {
    getAnime,
    getEpisode,
    searchAnime,
    healthCheck
} from "../lib/scraper.js"

const app = express()

app.disable("x-powered-by")

app.use(express.json({
    limit: "1mb"
}))

app.use(express.urlencoded({
    extended: true,
    limit: "1mb"
}))

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

    if (req.method === "OPTIONS") {
        return res.status(204).end()
    }

    next()
})

app.get("/", (req, res) => {
    res.json({
        success: true,
        name: "AnimeKu API",
        version: "1.0.0",
        source: "Oploverz",
        description: "Public anime metadata API",
        endpoints: {
            health: "/api/health",
            search: "/api/search?q=one+piece",
            anime: "/api/anime/one-piece",
            episode: "/api/anime/one-piece/episode/1178"
        }
    })
})

app.get("/api", (req, res) => {
    res.json({
        success: true,
        name: "AnimeKu API",
        version: "1.0.0"
    })
})

app.get("/api/health", async (req, res) => {
    try {
        const health = await healthCheck()

        res.json({
            success: true,
            ...health
        })
    } catch (error) {
        res.status(503).json({
            success: false,
            status: "error",
            error: error.message
        })
    }
})

app.get("/api/search", async (req, res) => {
    try {
        const query = req.query.q || req.query.query || req.query.search
        const page = Number(req.query.page || 1)

        if (!query) {
            return res.status(400).json({
                success: false,
                error: "Parameter q wajib diisi"
            })
        }

        const data = await searchAnime(query, page)

        res.json({
            success: true,
            ...data
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        })
    }
})

app.get("/api/anime/:slug", async (req, res) => {
    try {
        const data = await getAnime(req.params.slug)

        res.json({
            success: true,
            ...data
        })
    } catch (error) {
        const status =
            error.message.includes("tidak ditemukan") ? 404 : 500

        res.status(status).json({
            success: false,
            error: error.message
        })
    }
})

app.get("/api/anime/:slug/episode/:episode", async (req, res) => {
    try {
        const data = await getEpisode(
            req.params.slug,
            req.params.episode
        )

        res.json({
            success: true,
            ...data
        })
    } catch (error) {
        const status =
            error.message.includes("tidak ditemukan") ? 404 : 500

        res.status(status).json({
            success: false,
            error: error.message
        })
    }
})

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Endpoint tidak ditemukan",
        path: req.path
    })
})

app.use((error, req, res, next) => {
    console.error(error)

    res.status(500).json({
        success: false,
        error: "Internal server error"
    })
})

const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
    app.listen(PORT, () => {
        console.log(`AnimeKu API berjalan di http://localhost:${PORT}`)
    })
}

export default app
