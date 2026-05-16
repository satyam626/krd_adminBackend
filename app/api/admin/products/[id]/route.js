import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { withAuth } from '@/lib/middleware'
import { saveUploadedFile, deleteFile } from '@/lib/upload'

export async function GET(request, context) {
  try {
    const { id } = await context.params
    const products = await query(
      `SELECT p.*, pc.name as category_name FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.id = ?`,
      [id]
    )
    if (!products.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ product: products[0] })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

export const PUT = withAuth(async function(request, { params }) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let data = {}
    let newImageUrls = null
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const imageFiles = formData.getAll('images')
      
      if (imageFiles.some(f => f && f.size > 0)) {
        // Delete old images
        const old = await query('SELECT images, featured_image FROM products WHERE id = ?', [params.id])
        if (old.length) {
          const oldImages = JSON.parse(old[0].images || '[]')
          oldImages.forEach(img => deleteFile(img))
        }
        
        newImageUrls = []
        for (const file of imageFiles) {
          if (file && file.size > 0) {
            const uploaded = await saveUploadedFile(file, 'products')
            newImageUrls.push(uploaded.fileUrl)
          }
        }
      }
      
      const fields = ['category_id', 'name', 'slug', 'short_description', 'description', 
        'price', 'old_price', 'sku', 'stock_quantity', 'weight', 'volume',
        'is_featured', 'is_new', 'is_active', 'sort_order', 'meta_title', 'meta_description']
      
      fields.forEach(f => {
        const val = formData.get(f)
        if (val !== null) data[f] = val
      })
    } else {
      data = await request.json()
    }
    
    if (newImageUrls) {
      data.images = JSON.stringify(newImageUrls)
      data.featured_image = newImageUrls[0] || null
    }
    
    const setClauses = []
    const values = []
    
    Object.entries(data).forEach(([key, val]) => {
      setClauses.push(`${key} = ?`)
      values.push(val)
    })
    
    if (!setClauses.length) return NextResponse.json({ error: 'No data' }, { status: 400 })
    
    values.push(params.id)
    await query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, values)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
})

export const DELETE = withAuth(async function(request, { params }) {
  try {
    const products = await query('SELECT images FROM products WHERE id = ?', [params.id])
    if (products.length) {
      const images = JSON.parse(products[0].images || '[]')
      images.forEach(img => deleteFile(img))
    }
    await query('DELETE FROM products WHERE id = ?', [params.id])
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
})
