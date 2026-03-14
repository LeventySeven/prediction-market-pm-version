-- Communities: user-created public market communities scoped by AI tags
CREATE TABLE IF NOT EXISTS communities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  avatar_url text,
  accent_color text NOT NULL DEFAULT '#6366F1',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_creator ON communities(creator_user_id);

CREATE TABLE IF NOT EXISTS community_tag_filters (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  tag text NOT NULL,
  UNIQUE (community_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_community_tag_filters_community ON community_tag_filters(community_id);
CREATE INDEX IF NOT EXISTS idx_community_tag_filters_tag ON community_tag_filters(tag);

CREATE TABLE IF NOT EXISTS community_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_memberships_community ON community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_user ON community_memberships(user_id);
