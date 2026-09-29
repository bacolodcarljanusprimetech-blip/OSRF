import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedRoles = new Set(['APPROVER', 'RECEIVER'])
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

  if (!token) return respond({ error: 'Authentication is required.' }, 401)
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ error: 'The Edge Function is missing required Supabase secrets.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: actorData, error: actorError } = await admin.auth.getUser(token)
  if (actorError || !actorData.user || actorData.user.app_metadata?.role !== 'ADMIN') {
    return respond({ error: 'Administrator access is required.' }, 403)
  }

  const { data: actorProfile, error: actorProfileError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', actorData.user.id)
    .maybeSingle()

  if (actorProfileError) return respond({ error: actorProfileError.message }, 500)
  if (actorProfile?.role !== 'ADMIN' || !actorProfile.is_active) {
    return respond({ error: 'This administrator account is inactive or not configured.' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return respond({ error: 'A valid JSON request body is required.' }, 400)
  }

  const action = body.action

  if (action === 'list') {
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('full_name', { ascending: true })

    if (error) return respond({ error: error.message }, 500)
    return respond({ users: data ?? [] })
  }

  if (action === 'create') {
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body.role === 'string' ? body.role : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!fullName || fullName.length > 120 || !validEmail(email) || !allowedRoles.has(role) || password.length < 8) {
      return respond({ error: 'Enter a name, valid email, APPROVER or RECEIVER role, and a password of at least 8 characters.' }, 400)
    }

    const { data: createData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError || !createData.user) {
      return respond({ error: createError?.message ?? 'Supabase did not create the user.' }, 400)
    }

    const createdUser = createData.user
    const { error: metadataError } = await admin.auth.admin.updateUserById(createdUser.id, {
      app_metadata: { ...createdUser.app_metadata, role, is_active: true },
    })

    if (metadataError) {
      await admin.auth.admin.deleteUser(createdUser.id)
      return respond({ error: metadataError.message }, 500)
    }

    const { error: insertError } = await admin.from('profiles').insert({
      id: createdUser.id,
      email,
      full_name: fullName,
      role,
      is_active: true,
    })

    if (insertError) {
      await admin.auth.admin.deleteUser(createdUser.id)
      return respond({ error: insertError.message }, 500)
    }

    return respond({ message: 'Account created without sending email. The password cannot be viewed again after this form is cleared.', user_id: createdUser.id }, 201)
  }

  if (action === 'update') {
    const id = typeof body.id === 'string' ? body.id : ''
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body.role === 'string' ? body.role : ''

    if (!id || !fullName || fullName.length > 120 || !validEmail(email) || !allowedRoles.has(role)) {
      return respond({ error: 'Enter a valid user, name, email, and APPROVER or RECEIVER role.' }, 400)
    }

    const { data: currentProfile, error: currentError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (currentError) return respond({ error: currentError.message }, 500)
    if (!currentProfile || currentProfile.role === 'ADMIN') {
      return respond({ error: 'This user cannot be edited here.' }, 404)
    }

    const { data: emailOwner, error: emailCheckError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .neq('id', id)
      .maybeSingle()

    if (emailCheckError) return respond({ error: emailCheckError.message }, 500)
    if (emailOwner) return respond({ error: 'Another account already uses this email address.' }, 409)

    const { data: currentAuthData, error: getAuthError } = await admin.auth.admin.getUserById(id)
    if (getAuthError || !currentAuthData.user) {
      return respond({ error: getAuthError?.message ?? 'Auth user not found.' }, 404)
    }

    const authUser = currentAuthData.user
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
      app_metadata: { ...authUser.app_metadata, role },
      user_metadata: { ...authUser.user_metadata, full_name: fullName },
    })

    if (authUpdateError) return respond({ error: authUpdateError.message }, 400)

    const { error: profileUpdateError } = await admin
      .from('profiles')
      .update({ email, full_name: fullName, role, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (profileUpdateError) return respond({ error: profileUpdateError.message }, 500)
    return respond({ message: 'User information updated.' })
  }

  if (action === 'set-active') {
    const id = typeof body.id === 'string' ? body.id : ''
    const isActive = body.is_active
    if (!id || typeof isActive !== 'boolean') {
      return respond({ error: 'A user id and active status are required.' }, 400)
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (profileError) return respond({ error: profileError.message }, 500)
    if (!profile || profile.role === 'ADMIN') {
      return respond({ error: 'This user cannot be changed here.' }, 404)
    }

    const { data: authRecord, error: authRecordError } = await admin.auth.admin.getUserById(id)
    if (authRecordError || !authRecord.user) {
      return respond({ error: authRecordError?.message ?? 'Auth user not found.' }, 404)
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: isActive ? 'none' : '876000h',
      app_metadata: { ...authRecord.user.app_metadata, is_active: isActive },
    })
    if (authUpdateError) return respond({ error: authUpdateError.message }, 400)

    const { error: updateError } = await admin
      .from('profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) return respond({ error: updateError.message }, 500)
    return respond({ message: isActive ? 'User activated.' : 'User deactivated.' })
  }

  if (action === 'delete') {
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id || id === actorData.user.id) {
      return respond({ error: 'A different non-admin user must be selected.' }, 400)
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (profileError) return respond({ error: profileError.message }, 500)
    if (!profile || profile.role === 'ADMIN') {
      return respond({ error: 'Admin accounts cannot be deleted here.' }, 403)
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(id)
    if (deleteError) return respond({ error: deleteError.message }, 400)

    return respond({ message: 'User permanently deleted.' })
  }

  if (action === 'send-reset') {
    if (!anonKey) return respond({ error: 'A Supabase anon or publishable key is required to send reset emails.' }, 500)
    const id = typeof body.id === 'string' ? body.id : ''
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, email, role, is_active')
      .eq('id', id)
      .maybeSingle()

    if (error) return respond({ error: error.message }, 500)
    if (!profile || !profile.is_active || profile.role === 'ADMIN') {
      return respond({ error: 'Only active Approver or Receiver accounts can receive a password reset email.' }, 400)
    }

    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const redirectTo = `${appUrl}/?flow=recovery`
    const { error: resetError } = await publicClient.auth.resetPasswordForEmail(profile.email, { redirectTo })
    if (resetError) return respond({ error: resetError.message }, 400)
    return respond({ message: 'Password reset email sent.' })
  }

  return respond({ error: 'Unknown user-management action.' }, 400)
})
