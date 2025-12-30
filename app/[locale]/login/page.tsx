
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useFirebase } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { redirect, usePathname } from 'next/navigation';
import { Building, Eye, EyeOff, X, Check } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, writeBatch, collection, Timestamp, addDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import type { Company, UserProfile } from '@/lib/types';
import { db } from '@/firebase/client';


export default function LoginPage() {
  const { t } = useTranslation();
  const { auth, user, isUserLoading, refreshUserProfile } = useFirebase();
  const { toast } = useToast();
  const pathname = usePathname();
  const locale = (pathname.split('/')[1] || 'en') as 'en' | 'ru';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const validatePassword = (password: string) => {
    const rules = {
      length: password.length >= 8 && password.length <= 20,
      letter: /[a-zA-Z]/.test(password),
      number: /[0-9]/.test(password),
      upper: /[A-Z]/.test(password),
      special: /[@#$%!]/.test(password),
      noCyrillic: !/[а-яА-Я]/.test(password),
      noSpaces: !/\s/.test(password),
    };
    return rules;
  };

  const handleAuthError = (error: unknown) => {
    let title = t('Error');
    let description = t('Something Went Wrong');

    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/user-not-found':
          title = t('Sign In Failed');
          description = "User not found. Please check your email or sign up for a new account.";
          break;
        case 'auth/wrong-password':
          title = t('Sign In Failed');
          description = "Incorrect password. Please try again.";
          break;
        case 'auth/invalid-credential':
          title = t('Sign In Failed');
          description = "Invalid email or password. Please check your credentials and try again.";
          break;
        case 'auth/email-already-in-use':
          title = t('Sign Up Failed');
          description = "This email is already in use. Please sign in instead.";
          break;
        case 'auth/weak-password':
          title = t('Sign Up Failed');
          description = t('Weak Password');
          break;
        default:
          description = error.message;
          break;
      }
    } else if (error instanceof Error) {
      description = error.message;
    }
    
    toast({
      variant: 'destructive',
      title: title,
      description: description,
    });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      handleAuthError(new Error(t('Auth Service Not Available')));
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in provider will handle profile refresh and redirect
    } catch (error) {
      handleAuthError(error);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: 'destructive', title: t('Error'), description: t('Passwords Do Not Match') });
      return;
    }
     if (!agreedToTerms) {
      toast({ variant: "destructive", title: t('Agreement Required'), description: t('You Must Agree To The Terms') });
      return;
    }

    const passwordRules = validatePassword(password);
    if (!Object.values(passwordRules).every(Boolean)) {
      toast({ variant: 'destructive', title: t('Password Validation Failed'), description: t('Password Does Not Meet Requirements') });
      return;
    }

    if (!auth || !db) {
      handleAuthError(new Error(t('Auth Service Not Available')));
      return;
    }
    
    try {
      // Create the user first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      // Use a batch write to ensure atomicity
      const batch = writeBatch(db);

      // 1. Create a new company for the user
      const newCompanyRef = doc(collection(db, 'companies'));
      const newCompanyData: Omit<Company, 'id'> = {
        name: `${name}'s Company`,
        ownerId: newUser.uid,
        createdAt: serverTimestamp() as Timestamp,
        userCount: 1,
      };
      batch.set(newCompanyRef, newCompanyData);

      // 2. Create the user's profile and link it to the new company
      const userProfileRef = doc(db, 'users', newUser.uid);
      const newUserProfile: Omit<UserProfile, 'id'> = {
        uid: newUser.uid,
        name: name,
        email: email,
        phoneNumber: phoneNumber,
        companyId: newCompanyRef.id, // Assign the new company's ID to the user
        role: 'admin',
        permissions: {},
        createdAt: serverTimestamp() as Timestamp,
        isPaid: true,
        status: 'active',
        language: locale,
        currency: 'USD',
      };
      batch.set(userProfileRef, newUserProfile);

      // 3. Commit the batch
      await batch.commit();

      // Manually trigger a profile refresh to ensure the new data is loaded into the app's context
      await refreshUserProfile();
      
      // onAuthStateChanged in the provider will then handle the redirect

    } catch (error) {
      handleAuthError(error);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast({ variant: 'destructive', title: t('Error'), description: t('Please Enter Email') });
      return;
    }
    if (!auth) {
      handleAuthError(new Error(t('Auth Service Not Available')));
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: t('Password Reset Sent'), description: t('Password Reset Check Email') });
    } catch (error) {
      handleAuthError(error);
    }
  };
  
  if (!isUserLoading && user) {
    redirect(`/${locale}/dashboard`);
  }

  const passwordRules = validatePassword(password);
  const passwordsDoNotMatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isSignUpButtonDisabled = !agreedToTerms || password !== confirmPassword || !Object.values(passwordRules).every(Boolean);

  const passwordValidationMessages = {
    length: t('8-20 characters long'),
    letter: t('Contains at least one letter'),
    number: t('Contains at least one number'),
    upper: t('Contains at least one uppercase letter'),
    special: t('Contains one of @, #, $, %, !'),
    noCyrillic: t('Does not contain Cyrillic characters'),
    noSpaces: t('Does not contain spaces'),
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
       <div className="absolute top-8 left-8 flex items-center gap-2">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Building className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">TradeFlow</h1>
          </Link>
        </div>
      <Tabs defaultValue="signin" className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">{t('Sign In')}</TabsTrigger>
          <TabsTrigger value="signup">{t('Sign Up')}</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <Card>
            <form onSubmit={handleEmailSignIn}>
              <CardHeader>
                <CardTitle>{t('Sign In')}</CardTitle>
                <CardDescription>{t('Sign In To Your Account')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('Email')}</Label>
                  <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2 relative">
                   <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t('Password')}</Label>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={handlePasswordReset}
                    >
                      {t('Forgot Password')}
                    </Button>
                  </div>
                  <Input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
                   <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-8 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{showPassword ? t('Hide Password') : t('Show Password')}</span>
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-4">
                <Button className="w-full" type="submit">{t('Sign In')}</Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card>
            <form onSubmit={handleEmailSignUp}>
              <CardHeader>
                <CardTitle>{t('Create Your Account')}</CardTitle>
                <CardDescription>{t('Get Started With Your Team')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('Your Name')}</Label>
                  <Input id="name" type="text" placeholder={t('Your Name Placeholder')} required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="signup-email">{t('Your Email')}</Label>
                  <Input id="signup-email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="signup-phone">{t('Phone Number')}</Label>
                  <Input id="signup-phone" type="tel" placeholder="+1234567890" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </div>
                <div className="relative space-y-2">
                  <Label htmlFor="signup-password">{t('Password')}</Label>
                  <Input 
                    id="signup-password" 
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(passwordsDoNotMatch && 'border-destructive')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-6 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? t('Hide Password') : t('Show Password')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                 <div className="relative space-y-2">
                  <Label htmlFor="confirm-password">{t('Confirm Password')}</Label>
                  <Input 
                    id="confirm-password" 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    required 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={cn(passwordsDoNotMatch && 'border-destructive')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-6 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? t('Hide Password') : t('Show Password')}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {password.length > 0 && (
                  <div className="text-sm text-muted-foreground space-y-1 mt-2 p-3 bg-muted/50 rounded-md">
                    <p className="font-medium text-foreground mb-2">{t('Password must:')}</p>
                    {Object.entries(passwordRules).map(([rule, isValid]) => (
                      <div key={rule} className="flex items-center gap-2">
                        {isValid ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                        <span>{passwordValidationMessages[rule as keyof typeof passwordValidationMessages]}</span>
                      </div>
                    ))}
                  </div>
                )}
                {passwordsDoNotMatch && (
                    <p className="text-sm font-medium text-destructive">{t('Passwords Do Not Match')}</p>
                )}
                
                 <div className="flex items-center space-x-2 pt-2">
                    <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)} />
                    <Label htmlFor="terms" className="text-sm font-normal">
                    {t('I Agree To The')} <Link href={`/${locale}/terms`} className="underline hover:text-primary" target="_blank">{t('Terms And Privacy Policy')}</Link>.
                    </Label>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" type="submit" disabled={isSignUpButtonDisabled}>{t('Create Account')}</Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
