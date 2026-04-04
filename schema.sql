-- 1. TABLOLARI OLUŞTURMA
CREATE TABLE tenants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  description text,
  settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TYPE user_role AS ENUM ('super_admin', 'admin');

CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role user_role DEFAULT 'admin',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TYPE survey_status AS ENUM ('draft', 'active', 'closed', 'paused');

CREATE TABLE surveys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  slug text UNIQUE NOT NULL,
  status survey_status DEFAULT 'draft',
  welcome_message text,
  thank_you_message text,
  allow_multiple_responses boolean DEFAULT false,
  track_ip boolean DEFAULT true,
  use_cookies boolean DEFAULT true,
  require_login boolean DEFAULT false,
  settings jsonb DEFAULT '{}'::jsonb,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  response_count integer DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'text', 'radio', 'checkbox' vs
  title text NOT NULL,
  description text,
  placeholder text,
  options jsonb, -- ['seçenek 1', 'seçenek 2']
  settings jsonb DEFAULT '{}'::jsonb,
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  ip_hash text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  is_complete boolean DEFAULT false,
  partial_data jsonb,
  metadata jsonb
);

CREATE TABLE response_answers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. TRİGGERLAR VE FONKSİYONLAR
-- Yeni user eklenince profile de eklensin 
-- (Not: Güvenlik sebebiyle trigger ile yapmak yerine backend/edge functions önerilir ama MVP için basitleştirildi)

-- Response oluşturulduğunda Survey tablosundaki response_count değerini 1 arttırma
CREATE OR REPLACE FUNCTION increment_response_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE surveys SET response_count = response_count + 1 WHERE id = NEW.survey_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_response_count_trigger
AFTER INSERT ON responses
FOR EACH ROW
WHEN (NEW.is_complete = true)
EXECUTE FUNCTION increment_response_count();

-- 3. RLS (Row Level Security) KURALLARI
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_answers ENABLE ROW LEVEL SECURITY;

-- Super Admin Her şeyi Görebilir/Değiştirebilir:
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$ LANGUAGE sql SECURITY DEFINER;

-- Profil okuma: Kullanıcının sadece kendi profilini veya adminse tenantındaki profilleri görmesi (Super Admin hariç tutmak için is_super_admin function'ını kullanabilirsiniz)
CREATE POLICY "Super admin all access profiles" ON profiles FOR ALL USING (is_super_admin());
CREATE POLICY "User can read own profile" ON profiles FOR SELECT USING (id = auth.uid());

-- Tenant (Kurum) okuma
CREATE POLICY "Super admin all access tenants" ON tenants FOR ALL USING (is_super_admin());
CREATE POLICY "Public can view active tenants for logos" ON tenants FOR SELECT USING (is_active = true);

-- Survey okuma ve yazma (Tenant İzolasyonunun En Önemli Kısmı)
CREATE POLICY "Public can view active surveys" ON surveys FOR SELECT USING (status = 'active');
CREATE POLICY "Admin manages its own surveys" ON surveys FOR ALL 
USING (
  tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()) 
  OR is_super_admin()
);

-- Questions (Sorular)
CREATE POLICY "Public can view active survey questions" ON questions FOR SELECT USING (
  survey_id IN (SELECT id FROM surveys WHERE status = 'active')
);
CREATE POLICY "Admin manages its own questions" ON questions FOR ALL 
USING (
  survey_id IN (SELECT id FROM surveys WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  OR is_super_admin()
);

-- Responses (Yanıtlar)
-- Herkes yanıt ekleyebilir (Anonim anket ekleme açıksa auth kontrolüne gerek yok)
CREATE POLICY "Public can insert responses" ON responses FOR INSERT WITH CHECK (true);
-- Sadece o kurumun admini veya Super admin cevapları okuyabilir
CREATE POLICY "Admin can view responses" ON responses FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()) OR is_super_admin()
);

-- Response Answers (Yanıt detayları)
CREATE POLICY "Public can insert answers" ON response_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can view answers" ON response_answers FOR SELECT USING (
  response_id IN (
    SELECT id FROM responses WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  ) OR is_super_admin()
);
