import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL, { tls: {} })

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  await redis.lpush("jobs", JSON.stringify(req.body))

  return res.status(200).json({ ok: true })
}