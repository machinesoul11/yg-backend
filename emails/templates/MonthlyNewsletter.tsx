/**
 * Monthly Newsletter Email Template
 * Monthly digest of platform updates, creator spotlights, and industry insights
 */

import React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { H1, H2, H3, Text, Caption, Declaration } from '../components/Typography';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
import { Section, Img } from '@react-email/components';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';

interface NewsletterUpdate {
  title: string;
  description: string;
  url?: string;
}

interface FeaturedCreator {
  name: string;
  bio: string;
  quote: string;
  imageUrl?: string;
  profileUrl: string;
}

interface InsightArticle {
  title: string;
  excerpt: string;
  url: string;
}

interface MonthlyNewsletterProps {
  month: string;
  introduction?: string;
  updates?: NewsletterUpdate[];
  featuredCreator?: FeaturedCreator;
  insights?: InsightArticle;
  unsubscribeUrl?: string;
}

export default function MonthlyNewsletter({
  month = 'October 2025',
  introduction = 'The work continues. The platform evolves. The initiated gather strength.',
  updates = [],
  featuredCreator,
  insights,
  unsubscribeUrl,
}: MonthlyNewsletterProps) {
  return (
    <EmailLayout 
      previewText={`YES GODDESS: ${month} Update`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Caption style={{ textAlign: 'center', margin: '0 0 8px' }}>
        {month}
      </Caption>
      
      <H1 style={{ textAlign: 'center', margin: '0 0 32px' }}>
        The Initiated
      </H1>

      <Text>{introduction}</Text>

      {updates && updates.length > 0 && (
        <>
          <Divider variant="gold" />
          
          <H2>Platform Updates</H2>
          
          {updates.map((update, index) => (
            <Section key={index} style={updateSection}>
              <Text style={{ margin: '0 0 4px', letterSpacing: '1px' }}>
                — {update.title}
              </Text>
              <Text style={{ color: EMAIL_COLORS.SANCTUM, margin: '0 0 16px' }}>
                {update.description}
              </Text>
              {update.url && (
                <Text style={{ margin: '0 0 8px' }}>
                  <a href={update.url} style={emailStyles.link}>
                    Learn more
                  </a>
                </Text>
              )}
            </Section>
          ))}
        </>
      )}

      {featuredCreator && (
        <>
          <Divider variant="gold" />
          
          <H2>Creator Spotlight</H2>
          
          <Section style={creatorSection}>
            {featuredCreator.imageUrl && (
              <Img
                src={featuredCreator.imageUrl}
                alt={featuredCreator.name}
                width="100"
                height="100"
                style={creatorImage}
              />
            )}
            
            <H3 style={{ margin: '16px 0 8px' }}>
              {featuredCreator.name}
            </H3>
            
            <Text style={{ color: EMAIL_COLORS.SANCTUM }}>
              {featuredCreator.bio}
            </Text>
            
            <Declaration style={{ 
              borderLeft: `3px solid ${EMAIL_COLORS.ALTAR}`,
              paddingLeft: '20px',
              marginLeft: '0',
              fontStyle: 'italic',
            }}>
              "{featuredCreator.quote}"
            </Declaration>
            
            <Button href={featuredCreator.profileUrl} variant="secondary">
              View Profile
            </Button>
          </Section>
        </>
      )}

      {insights && (
        <>
          <Divider variant="gold" />
          
          <H2>Industry Insights</H2>
          
          <Section style={insightSection}>
            <H3>{insights.title}</H3>
            <Text style={{ color: EMAIL_COLORS.SANCTUM }}>
              {insights.excerpt}
            </Text>
            <Button href={insights.url} variant="secondary">
              Read Full Article
            </Button>
          </Section>
        </>
      )}

      <Divider />

      <Declaration style={{ textAlign: 'center' }}>
        The work continues.
      </Declaration>

      <Section style={{ textAlign: 'center', marginTop: '32px' }}>
        <Button href={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard`}>
          Visit the Platform
        </Button>
      </Section>
    </EmailLayout>
  );
}

const updateSection = {
  marginBottom: '24px',
};

const creatorSection = {
  marginTop: '24px',
};

const creatorImage = {
  borderRadius: '50%',
  display: 'block',
  margin: '0 auto',
};

const insightSection = {
  marginTop: '24px',
};
