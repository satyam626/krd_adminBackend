import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { withAuth } from '@/lib/middleware'
import { saveUploadedFile } from '@/lib/upload'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('category_id')
    const featured = searchParams.get('featured')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit
    const activeOnly = searchParams.get('active') !== 'false'
    
    let sql = `
      SELECT p.*, pc.name as category_name, pc.slug as category_slug 
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE 1=1
    `
    const params = []
    
    if (activeOnly) { sql += ' AND p.is_active = 1' }
    if (categoryId) { sql += ' AND p.category_id = ?'; params.push(categoryId) }
    if (featured === '1') { sql += ' AND p.is_featured = 1' }
    if (search) { sql += ' AND (p.name LIKE ? OR p.short_description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    
    // Count total
    const countSql = sql.replace('SELECT p.*, pc.name as category_name, pc.slug as category_slug', 'SELECT COUNT(*) as total')
    const countResult = await query(countSql, params)
    const total = countResult[0].total
    
    sql += ' ORDER BY p.sort_order ASC, p.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    
    const products = await query(sql, params)
    
    return NextResponse.json({ products, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

export const POST = withAuth(async function(request) {
  try {
    const formData = await request.formData()
    const imageFiles = formData.getAll('images')
    const imageUrls = []
    
    for (const file of imageFiles) {
      if (file && file.size > 0) {
        const uploaded = await saveUploadedFile(file, 'products')
        imageUrls.push(uploaded.fileUrl)
      }
    }
    
    const name = formData.get('name')
    const slug = formData.get('slug') || name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    const result = await query(
      `INSERT INTO products 
       (category_id, name, slug, short_description, description, price, old_price, sku,
        stock_quantity, images, featured_image, weight, volume, is_featured, is_new, 
        is_active, sort_order, meta_title, meta_description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        formData.get('category_id') || null,
        name, slug,
        formData.get('short_description') || null,
        formData.get('description') || null,
        formData.get('price') || null,
        formData.get('old_price') || null,
        formData.get('sku') || null,
        formData.get('stock_quantity') || 0,
        JSON.stringify(imageUrls),
        imageUrls[0] || null,
        formData.get('weight') || null,
        formData.get('volume') || null,
        formData.get('is_featured') === '1' ? 1 : 0,
        formData.get('is_new') === '1' ? 1 : 0,
        formData.get('is_active') !== '0' ? 1 : 0,
        formData.get('sort_order') || 0,
        formData.get('meta_title') || null,
        formData.get('meta_description') || null,
      ]
    )
    
    return NextResponse.json({ success: true, id: result.insertId })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
})
